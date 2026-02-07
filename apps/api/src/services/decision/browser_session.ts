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
  viewportWidth?: number;
  viewportHeight?: number;
}

const DEFAULT_CONFIG: Required<BrowserSessionConfig> = {
  headless: true,
  slowMo: 0,
  screenshotDir: "./data/screenshots",
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

    // Ensure screenshot directory exists
    await mkdir(this.config.screenshotDir, { recursive: true });

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
      recordVideo: undefined, // Could enable for debugging
    });

    this.page = await this.context.newPage();

    // Set up console log capture
    this.page.on("console", (msg) => {
      const type = msg.type();
      if (type === "error" || type === "warning") {
        console.log(`[Browser Console ${type}] ${msg.text()}`);
      }
    });

    // Set up page error capture
    this.page.on("pageerror", (error) => {
      console.error(`[Browser Page Error] ${error.message}`);
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
   * Get console logs from the page
   */
  async getConsoleLogs(): Promise<string[]> {
    // Note: In a real implementation, we'd accumulate logs
    // For now, return empty - logs are captured via events
    return [];
  }

  /**
   * Get network errors
   */
  async getNetworkErrors(): Promise<string[]> {
    // Note: In a real implementation, we'd track failed requests
    // For now, return empty
    return [];
  }

  /**
   * Close the browser session
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    console.log("[BrowserSession] Browser session closed");
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.browser !== null && !this.browser.isConnected() === false;
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

export async function closeAllSessions(): Promise<void> {
  for (const [runId, session] of sessions) {
    await session.close();
    sessions.delete(runId);
  }
}
