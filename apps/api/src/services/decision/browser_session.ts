/**
 * Browser Session Manager
 * 
 * Manages Playwright browser instances and contexts.
 * Reuses sessions per run for efficiency.
 * 
 * This component does NOT:
 * - Make decisions
 * - Update beliefs
 * - Interpret results
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface BrowserSessionConfig {
  headless?: boolean;
  slowMo?: number;
  screenshotDir?: string;
  videoDir?: string;
  viewportWidth?: number;
  viewportHeight?: number;
}

/**
 * Structured snapshot of the current page's DOM.
 * Provides NOEMA with visibility into the page structure,
 * interactive elements, forms, headings, and error messages.
 */
export interface PageDOMSnapshot {
  title: string;
  url: string;
  metaDescription: string;
  headings: { level: number; text: string }[];
  interactiveElements: {
    tag: string;
    type: string;
    selector: string;
    text: string;
    visible: boolean;
    attributes: Record<string, string>;
  }[];
  forms: {
    selector: string;
    action: string;
    method: string;
    fields: {
      tag: string;
      type: string;
      name: string;
      placeholder: string;
      selector: string;
    }[];
  }[];
  errorMessages: string[];
  bodyTextPreview: string;
  totalElements: number;
}

const DEFAULT_CONFIG: Required<BrowserSessionConfig> = {
  headless: true,
  slowMo: 0,
  screenshotDir: "./data/screenshots",
  videoDir: "./data/videos",
  viewportWidth: 1280,
  viewportHeight: 720,
};

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly config: Required<BrowserSessionConfig>;
  private readonly runId: string;
  private screenshotCount = 0;
  /** Accumulated browser console logs */
  private consoleLogs: string[] = [];
  /** Accumulated network errors (failed requests) */
  private networkErrors: string[] = [];
  /** Path to the recorded video file (available after close) */
  private videoPath: string | null = null;

  constructor(runId: string, config: Partial<BrowserSessionConfig> = {}) {
    this.runId = runId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize browser session
   */
  async initialize(): Promise<void> {
    if (this.browser) {
      console.log("[BrowserSession] Already initialized");
      return;
    }

    // Ensure screenshot and video directories exist
    await mkdir(this.config.screenshotDir, { recursive: true });
    await mkdir(this.config.videoDir, { recursive: true });

    console.log(`[BrowserSession] Launching browser (headless: ${this.config.headless})`);
    
    this.browser = await chromium.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMo,
    });

    this.context = await this.browser.newContext({
      viewport: {
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
      recordVideo: {
        dir: this.config.videoDir,
        size: {
          width: this.config.viewportWidth,
          height: this.config.viewportHeight,
        },
      },
    });

    this.page = await this.context.newPage();

    // Set up console log capture — accumulate all console messages
    this.page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      const entry = `[${type.toUpperCase()}] ${text}`;
      this.consoleLogs.push(entry);
      if (type === "error" || type === "warning") {
        console.log(`[Browser Console ${type}] ${text}`);
      }
    });

    // Set up page error capture — accumulate JS exceptions
    this.page.on("pageerror", (error) => {
      const entry = `[PAGE_ERROR] ${error.message}`;
      this.consoleLogs.push(entry);
      this.networkErrors.push(`JS Error: ${error.message}`);
      console.error(`[Browser Page Error] ${error.message}`);
    });

    // Track failed network requests
    this.page.on("requestfailed", (request) => {
      const failure = request.failure();
      const entry = `[REQUEST_FAILED] ${request.method()} ${request.url()} — ${failure?.errorText || "unknown"}`;
      this.networkErrors.push(entry);
      console.warn(`[Browser Network Error] ${entry}`);
    });

    // Track responses with error status codes (4xx, 5xx)
    this.page.on("response", (response) => {
      if (response.status() >= 400) {
        const entry = `[HTTP_${response.status()}] ${response.url()}`;
        this.networkErrors.push(entry);
      }
    });

    console.log("[BrowserSession] Browser session ready");
  }

  /**
   * Get the active page
   */
  getPage(): Page {
    if (!this.page) {
      throw new Error("Browser session not initialized. Call initialize() first.");
    }
    return this.page;
  }

  /**
   * Get current URL
   */
  getCurrentUrl(): string {
    return this.page?.url() || "";
  }

  /**
   * Take a screenshot and save it
   */
  async takeScreenshot(options?: { fullPage?: boolean; selector?: string }): Promise<string> {
    if (!this.page) {
      throw new Error("Browser session not initialized");
    }

    this.screenshotCount++;
    const filename = `${this.runId}_${this.screenshotCount}_${Date.now()}.png`;
    const filepath = join(this.config.screenshotDir, filename);

    if (options?.selector) {
      const element = await this.page.locator(options.selector).first();
      await element.screenshot({ path: filepath });
    } else {
      await this.page.screenshot({
        path: filepath,
        fullPage: options?.fullPage ?? false,
      });
    }

    console.log(`[BrowserSession] Screenshot saved: ${filepath}`);
    return filepath;
  }

  /**
   * Get accumulated console logs from the page and optionally clear them
   */
  getConsoleLogs(clear = false): string[] {
    const logs = [...this.consoleLogs];
    if (clear) {
      this.consoleLogs = [];
    }
    return logs;
  }

  /**
   * Get accumulated network errors and optionally clear them
   */
  getNetworkErrors(clear = false): string[] {
    const errors = [...this.networkErrors];
    if (clear) {
      this.networkErrors = [];
    }
    return errors;
  }

  /**
   * Extract the current page's DOM structure for NOEMA's understanding.
   * Returns a structured summary of page content, interactive elements, and text.
   * Uses Playwright APIs to extract data from the browser context.
   */
  async extractPageDOM(): Promise<PageDOMSnapshot> {
    if (!this.page) {
      throw new Error("Browser session not initialized");
    }

    // Use page.evaluate with explicit return type — the function body runs in the
    // browser context. We pass it as a string-based function to avoid TS DOM type issues.
    const snapshot: PageDOMSnapshot = await this.page.evaluate(`(() => {
      function getSelector(el) {
        if (el.id) return '#' + el.id;
        if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
        if (el.getAttribute('name')) return el.tagName.toLowerCase() + '[name="' + el.getAttribute('name') + '"]';
        if (el.className && typeof el.className === 'string') {
          var cls = el.className.trim().split(/\\s+/).slice(0, 2).join('.');
          if (cls) return el.tagName.toLowerCase() + '.' + cls;
        }
        return el.tagName.toLowerCase();
      }

      var title = document.title;
      var url = window.location.href;

      var interactiveEls = Array.from(document.querySelectorAll(
        "a, button, input, select, textarea, [role='button'], [role='link'], [role='tab'], [onclick]"
      ));

      var interactiveElements = interactiveEls.slice(0, 50).map(function(el) {
        var rect = el.getBoundingClientRect();
        var visible = rect.width > 0 && rect.height > 0 &&
          window.getComputedStyle(el).display !== 'none' &&
          window.getComputedStyle(el).visibility !== 'hidden';

        var attrs = {};
        ['href', 'type', 'name', 'placeholder', 'value', 'aria-label', 'role', 'disabled'].forEach(function(attr) {
          var val = el.getAttribute(attr);
          if (val) attrs[attr] = val;
        });

        return {
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || el.tagName.toLowerCase(),
          selector: getSelector(el),
          text: (el.textContent || '').trim().substring(0, 100),
          visible: visible,
          attributes: attrs
        };
      }).filter(function(e) { return e.visible; });

      var bodyText = (document.body && document.body.innerText || '').substring(0, 3000);

      var headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).slice(0, 15).map(function(h) {
        return {
          level: parseInt(h.tagName.substring(1)),
          text: (h.textContent || '').trim().substring(0, 150)
        };
      });

      var forms = Array.from(document.querySelectorAll('form')).slice(0, 10).map(function(f) {
        var fields = Array.from(f.querySelectorAll('input, select, textarea')).map(function(inp) {
          return {
            tag: inp.tagName.toLowerCase(),
            type: inp.getAttribute('type') || 'text',
            name: inp.getAttribute('name') || '',
            placeholder: inp.getAttribute('placeholder') || '',
            selector: getSelector(inp)
          };
        });
        return {
          selector: getSelector(f),
          action: f.getAttribute('action') || '',
          method: f.getAttribute('method') || 'get',
          fields: fields
        };
      });

      var errorElements = Array.from(document.querySelectorAll(
        '.error, .alert-danger, .alert-error, [role="alert"], .error-message, .form-error, .validation-error, .toast-error'
      )).slice(0, 10).map(function(el) {
        return (el.textContent || '').trim().substring(0, 200);
      }).filter(function(e) { return e.length > 0; });

      var metaEl = document.querySelector('meta[name="description"]');
      var metaDescription = metaEl ? (metaEl.getAttribute('content') || '') : '';

      return {
        title: title,
        url: url,
        metaDescription: metaDescription,
        headings: headings,
        interactiveElements: interactiveElements,
        forms: forms,
        errorMessages: errorElements,
        bodyTextPreview: bodyText,
        totalElements: document.querySelectorAll('*').length
      };
    })()`) as PageDOMSnapshot;

    return snapshot;
  }

  /**
   * Close the browser session.
   * Video is finalized when the context closes — the path is captured here.
   * All operations have timeouts to prevent indefinite hangs.
   */
  async close(): Promise<void> {
    const CLOSE_TIMEOUT = 5_000; // 5s max per operation

    // Save the video before closing (Playwright finalizes on context close)
    if (this.page) {
      try {
        const video = this.page.video();
        if (video) {
          const targetPath = join(this.config.videoDir, `${this.runId}.webm`);
          // video.saveAs() can hang indefinitely — race it
          await Promise.race([
            video.saveAs(targetPath),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error("video.saveAs timed out")), CLOSE_TIMEOUT)
            ),
          ]);
          this.videoPath = targetPath;
          console.log(`[BrowserSession] Video saved: ${targetPath}`);
        }
      } catch (err) {
        console.warn(`[BrowserSession] Could not save video: ${err}`);
      }
      try {
        await Promise.race([
          this.page.close(),
          new Promise<void>((resolve) => setTimeout(resolve, CLOSE_TIMEOUT)),
        ]);
      } catch { /* ignore */ }
      this.page = null;
    }
    if (this.context) {
      try {
        await Promise.race([
          this.context.close(),
          new Promise<void>((resolve) => setTimeout(resolve, CLOSE_TIMEOUT)),
        ]);
      } catch { /* ignore */ }
      this.context = null;
    }
    if (this.browser) {
      try {
        await Promise.race([
          this.browser.close(),
          new Promise<void>((resolve) => setTimeout(resolve, CLOSE_TIMEOUT)),
        ]);
      } catch { /* ignore */ }
      this.browser = null;
    }
    console.log("[BrowserSession] Browser session closed");
  }

  /**
   * Get the path to the recorded video file (only available after close).
   */
  getVideoPath(): string | null {
    return this.videoPath;
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }
}

// =============================================================================
// Session Manager (per-run session reuse)
// =============================================================================

const sessions = new Map<string, BrowserSession>();

export async function getOrCreateSession(
  runId: string,
  config?: Partial<BrowserSessionConfig>
): Promise<BrowserSession> {
  let session = sessions.get(runId);
  
  if (!session || !session.isActive()) {
    session = new BrowserSession(runId, config);
    await session.initialize();
    sessions.set(runId, session);
  }
  
  return session;
}

export async function closeSession(runId: string): Promise<void> {
  const session = sessions.get(runId);
  if (session) {
    await session.close();
    sessions.delete(runId);
  }
}

/**
 * Close the session and return the path to the recorded video (if any).
 */
export async function closeSessionAndGetVideo(runId: string): Promise<string | null> {
  const session = sessions.get(runId);
  if (session) {
    await session.close();
    const videoPath = session.getVideoPath();
    sessions.delete(runId);
    return videoPath;
  }
  return null;
}

export async function closeAllSessions(): Promise<void> {
  for (const [runId, session] of sessions) {
    await session.close();
    sessions.delete(runId);
  }
}
