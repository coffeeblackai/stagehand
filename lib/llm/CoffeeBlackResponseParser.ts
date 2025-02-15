import { Page } from "playwright";
import { CoffeeBlackResponse, CoffeeBlackBox, CoffeeBlackAction } from "./CoffeeBlackClient";

interface ParsedAction {
  method: "click" | "fill" | "press" | "scroll";
  selector?: string;
  value?: string;
  coordinates?: { x: number; y: number };
}

export class CoffeeBlackResponseParser {
  constructor(private page: Page) {}

  async parseResponse(response: CoffeeBlackResponse): Promise<ParsedAction> {
    const { chosen_action, chosen_element_index, boxes } = response;
    const targetBox = boxes[chosen_element_index];

    switch (chosen_action.action) {
      case "click":
        return this.parseClickAction(targetBox);
      case "type":
        return this.parseTypeAction(targetBox, chosen_action);
      case "scroll":
        return this.parseScrollAction(chosen_action);
      default:
        throw new Error(`Unsupported action: ${chosen_action.action}`);
    }
  }

  private parseClickAction(box: CoffeeBlackBox): ParsedAction {
    const { x1, y1, x2, y2 } = box.bbox;
    const width = x2 - x1;
    const height = y2 - y1;
    return {
      method: "click",
      coordinates: {
        x: x1 + width / 2,
        y: y1 + height / 2,
      },
    };
  }

  private parseTypeAction(box: CoffeeBlackBox, action: CoffeeBlackAction): ParsedAction {
    if (!action.input_text) {
      throw new Error("Type action requires input text");
    }

    return {
      method: "fill",
      coordinates: {
        x: box.mesh.x + box.mesh.width / 2,
        y: box.mesh.y + box.mesh.height / 2,
      },
      value: action.input_text,
    };
  }

  private parseScrollAction(action: CoffeeBlackAction): ParsedAction {
    if (!action.scroll_direction) {
      throw new Error("Scroll action requires direction");
    }

    return {
      method: "scroll",
      value: action.scroll_direction,
    };
  }

  async executeAction(parsedAction: ParsedAction): Promise<void> {
    switch (parsedAction.method) {
      case "click":
        if (parsedAction.coordinates) {
          await this.page.mouse.move(
            parsedAction.coordinates.x,
            parsedAction.coordinates.y,
            { steps: 10 },
          );
          await this.page.mouse.click(
            parsedAction.coordinates.x,
            parsedAction.coordinates.y,
          );
        }
        break;

      case "fill":
        if (parsedAction.coordinates && parsedAction.value) {
          await this.page.mouse.move(
            parsedAction.coordinates.x,
            parsedAction.coordinates.y,
            { steps: 10 },
          );
          await this.page.mouse.click(
            parsedAction.coordinates.x,
            parsedAction.coordinates.y,
          );
          await this.page.waitForTimeout(1000);
          await this.page.keyboard.type(parsedAction.value);
        }
        break;

      case "scroll":
        if (parsedAction.value === "up") {
          await this.page.mouse.wheel(0, -100);
        } else {
          await this.page.mouse.wheel(0, 100);
        }
        break;
    }
  }
} 