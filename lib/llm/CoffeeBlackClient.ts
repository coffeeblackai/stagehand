import { exponentialBackoff } from "../utils/retry";
import * as fs from "fs";
import * as path from "path";

interface CoffeeBlackClientOptions {
  apiEndpoint?: string;
  maxRetries?: number;
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  timeoutMs?: number;
  debug?: boolean;
}

export interface CoffeeBlackBox {
  _uniqueid: string;
  mesh: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  metadata: {
    element_type: string;
    bounding_box: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      width: number;
      height: number;
    };
  };
  confidence: number;
  is_chosen: boolean;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface CoffeeBlackAction {
  action: "type" | "click" | "scroll";
  key_command: string | null;
  input_text: string | null;
  scroll_direction: string | null;
  confidence: number;
}

export interface CoffeeBlackResponse {
  query: string;
  boxes: CoffeeBlackBox[];
  chosen_action: CoffeeBlackAction;
  chosen_element_index: number;
  explanation: string;
  raw_detections?: Record<string, unknown>;
  hierarchy?: Record<string, unknown>;
  timings?: Record<string, unknown>;
}

export class CoffeeBlackClient {
  private apiEndpoint: string;
  private maxRetries: number;
  private initialRetryDelayMs: number;
  private maxRetryDelayMs: number;
  private timeoutMs: number;
  private debug: boolean;

  constructor(options: CoffeeBlackClientOptions = {}) {
    this.apiEndpoint =
      options.apiEndpoint || "https://app.coffeeblack.ai/api/reason";
    this.maxRetries = options.maxRetries || 3;
    this.initialRetryDelayMs = options.initialRetryDelayMs || 1000;
    this.maxRetryDelayMs = options.maxRetryDelayMs || 10000;
    this.timeoutMs = options.timeoutMs || 30000;
    this.debug = options.debug || false;
  }

  private validateResponse(data: unknown): asserts data is CoffeeBlackResponse {
    if (!data || typeof data !== "object") {
      throw new Error("Invalid response: expected an object");
    }

    const response = data as Partial<CoffeeBlackResponse>;

    if (typeof response.query !== "string") {
      throw new Error("Invalid response: missing or invalid query");
    }

    if (!Array.isArray(response.boxes)) {
      throw new Error("Invalid response: missing or invalid boxes array");
    }

    if (!response.chosen_action || typeof response.chosen_action !== "object") {
      throw new Error("Invalid response: missing or invalid chosen_action");
    }

    if (typeof response.chosen_element_index !== "number") {
      throw new Error(
        "Invalid response: missing or invalid chosen_element_index",
      );
    }

    if (typeof response.explanation !== "string") {
      throw new Error("Invalid response: missing or invalid explanation");
    }
  }

  async reason(query: string, screenshot: Buffer): Promise<CoffeeBlackResponse> {
    return exponentialBackoff(
      async () => {
        try {
          // Only create debug directory and save files if debug is enabled
          if (this.debug) {
            // Create debug directory if it doesn't exist
            const debugDir = path.join(process.cwd(), "debug");
            if (!fs.existsSync(debugDir)) {
              fs.mkdirSync(debugDir, { recursive: true });
            }

            // Save screenshot
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const screenshotPath = path.join(debugDir, `screenshot_${timestamp}.png`);
            fs.writeFileSync(screenshotPath, screenshot);

            // Save request details
            const requestDetails = {
              timestamp,
              endpoint: this.apiEndpoint,
              query,
              screenshotPath,
            };
            fs.writeFileSync(
              path.join(debugDir, `request_${timestamp}.json`),
              JSON.stringify(requestDetails, null, 2)
            );
          }

          const formData = new FormData();
          formData.append("query", query);
          formData.append("file", new Blob([screenshot]), "screenshot.png");

          if (this.debug) {
            console.log("Sending request to:", this.apiEndpoint);
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

          try {
            const response = await fetch(this.apiEndpoint, {
              method: "POST",
              body: formData,
              signal: controller.signal,
            });

            if (this.debug) {
              console.log("Response status:", response.status);
              console.log("Response headers:", Object.fromEntries(response.headers.entries()));
            }

            if (!response.ok) {
              const errorBody = await response.text();
              if (this.debug) {
                console.log("Error response body:", errorBody);
                const debugDir = path.join(process.cwd(), "debug");
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                fs.writeFileSync(
                  path.join(debugDir, `error_${timestamp}.txt`),
                  `Status: ${response.status}\n\n${errorBody}`
                );
              }
              throw new Error(`CoffeeBlack API error (${response.status}): ${errorBody}`);
            }

            const data = await response.json();
            if (this.debug) {
              console.log("Success response:", data);
              const debugDir = path.join(process.cwd(), "debug");
              const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
              fs.writeFileSync(
                path.join(debugDir, `response_${timestamp}.json`),
                JSON.stringify(data, null, 2)
              );
            }
            this.validateResponse(data);
            return data;
          } finally {
            clearTimeout(timeoutId);
          }
        } catch (error) {
          if (this.debug) {
            console.error("Full error:", error);
          }
          if (error.name === 'AbortError') {
            throw new Error(`Request timed out after ${this.timeoutMs}ms`);
          }
          if (error instanceof TypeError) {
            throw new Error(`Network error: ${error.message}`);
          }
          throw error;
        }
      },
      {
        maxRetries: this.maxRetries,
        initialDelayMs: this.initialRetryDelayMs,
        maxDelayMs: this.maxRetryDelayMs,
        shouldRetry: (error) => {
          return (
            error instanceof TypeError ||
            error.message.includes("timed out") ||
            (error instanceof Error &&
              error.message.includes("CoffeeBlack API error (5"))
          );
        },
      }
    );
  }
} 