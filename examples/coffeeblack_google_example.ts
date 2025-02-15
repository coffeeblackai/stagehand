import { Stagehand } from "@/dist";
import { CoffeeBlackClient } from "../lib/llm/CoffeeBlackClient";
import { CoffeeBlackResponseParser } from "../lib/llm/CoffeeBlackResponseParser";
import StagehandConfig from "@/stagehand.config";

async function googleSearchExample() {
  // Initialize Stagehand with base config
  const stagehand = new Stagehand({
    ...StagehandConfig,
    env: "LOCAL", // Run locally for this example
  });

  await stagehand.init();
  const page = stagehand.page;
  
  try {
    // 1. Load Google
    await page.goto('https://www.google.com');
    
    // Initialize VLM client and parser
    const client = new CoffeeBlackClient({
      debug: true,
    });
    const parser = new CoffeeBlackResponseParser(page);
    
    // 2. Type "BrowserBase" into search
    const searchBoxScreenshot = await page.screenshot({ type: "png" });
    const typeResponse = await client.reason(
      'Type "BrowserBase" into the search box',
      searchBoxScreenshot as Buffer
    );

    console.log("Type Response:", {
      action: typeResponse.chosen_action,
      explanation: typeResponse.explanation,
      confidence: typeResponse.chosen_action.confidence,
    });
    
    // Parse and execute the typing action
    const parsedTypeAction = await parser.parseResponse(typeResponse);
    await parser.executeAction(parsedTypeAction);
    
    // 3. Press Enter to search
    await page.keyboard.press('Enter');
    
    // Wait for navigation
    await page.waitForNavigation();
    
    console.log('Search completed successfully!');
    
  } catch (error) {
    console.error('Error during search:', error);
  } finally {
    await stagehand.close();
  }
}

// Run the example
googleSearchExample().catch(console.error); 