import { CoffeeBlackBox } from "../llm/CoffeeBlackClient";
import { Page } from "playwright";

export async function createDebugVisualization(
  page: Page,
  boxes: CoffeeBlackBox[],
  chosenIndex: number,
  timestamp: number
): Promise<void> {
  // Add visualization elements to page
  await page.evaluate(
    ({ boxes, chosenIndex }) => {
      boxes.forEach((box, i) => {
        const div = document.createElement("div");
        div.style.position = "absolute";
        div.style.border = `2px solid ${i === chosenIndex ? "green" : "red"}`;
        div.style.left = `${box.bbox.x1}px`;
        div.style.top = `${box.bbox.y1}px`;
        div.style.width = `${box.bbox.x2 - box.bbox.x1}px`;
        div.style.height = `${box.bbox.y2 - box.bbox.y1}px`;
        div.style.pointerEvents = "none";
        div.style.zIndex = "999999";
        document.body.appendChild(div);
      });
    },
    { boxes, chosenIndex }
  );

  // Take screenshot with visualization
  await page.screenshot({
    path: `debug/visualization_${timestamp}.png`,
  });

  // Remove visualization elements
  await page.evaluate(() => {
    document.querySelectorAll("div[style*='border: 2px solid']").forEach(el => el.remove());
  });
} 