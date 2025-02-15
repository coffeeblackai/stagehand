import { Stagehand } from "@/dist";
import { CoffeeBlackClient } from "../lib/llm/CoffeeBlackClient";
import { CoffeeBlackResponseParser } from "../lib/llm/CoffeeBlackResponseParser";
import StagehandConfig from "@/stagehand.config";

async function coffeeBlackExample() {
  // Initialize Stagehand with base config
  const stagehand = new Stagehand({
    ...StagehandConfig,
    env: "LOCAL", // Run locally for this example
  });

  await stagehand.init();
  const page = stagehand.page;

  try {
    // Navigate to example.com
    await page.goto("https://example.com");

    // Initialize VLM client and parser
    const client = new CoffeeBlackClient();
    const parser = new CoffeeBlackResponseParser(page);

    // Take screenshot of the page
    const screenshot = await page.screenshot({ type: "png" });
    console.log("Screenshot taken, size:", screenshot.length, "bytes");

    // Send to VLM API with query
    console.log("Sending request to VLM API...");
    const response = await client.reason(
      "find and click the 'More information' link",
      screenshot as Buffer,
    );

    console.log("VLM Response:", {
      action: response.chosen_action,
      explanation: response.explanation,
      confidence: response.chosen_action.confidence,
    });

    // Parse and execute the action
    const parsedAction = await parser.parseResponse(response);
    await parser.executeAction(parsedAction);

    // Wait a moment to see the result
    await page.waitForTimeout(2000);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await stagehand.close();
  }
}

// Run the example
(async () => {
  await coffeeBlackExample();
})();
