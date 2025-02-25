import { Page, Browser } from "playwright";
import { CoffeeBlackResponse, CoffeeBlackBox, CoffeeBlackAction } from "./CoffeeBlackClient";
import * as fs from 'fs';
import * as path from 'path';

interface ParsedAction {
  method: "click" | "fill" | "press" | "scroll";
  selector?: string;
  value?: string;
  coordinates?: { x: number; y: number };
}

export class CoffeeBlackResponseParser {
  private page: Page;
  private debug: boolean;
  private debugDir: string;

  constructor(page: Page, options: { debug?: boolean, debugDir?: string } = {}) {
    this.page = page;
    this.debug = options.debug || false;
    this.debugDir = options.debugDir || path.join(process.cwd(), 'debug');
  }

  async parseResponse(response: CoffeeBlackResponse): Promise<ParsedAction> {
    const { chosen_action, chosen_element_index, boxes } = response;
    const targetBox = boxes[chosen_element_index];

    // Add debug visualization if enabled
    if (this.debug) {
      await this.saveDebugWithBoundingBoxes(response);
    }

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

  private async saveDebugWithBoundingBoxes(response: CoffeeBlackResponse) {
    try {
      if (!fs.existsSync(this.debugDir)) {
        fs.mkdirSync(this.debugDir, { recursive: true });
      }
      
      // Take a screenshot
      const screenshot = await this.page.screenshot({ type: 'png' });
      
      // Create filenames based on timestamp
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const imageFilename = `debug_${timestamp}.png`;
      const imagePath = path.join(this.debugDir, imageFilename);
      
      // Save the raw screenshot
      fs.writeFileSync(imagePath, screenshot);
      
      // Save the response JSON
      const responseFilename = `response_${timestamp}.json`;
      const responsePath = path.join(this.debugDir, responseFilename);
      fs.writeFileSync(responsePath, JSON.stringify(response, null, 2));
      
      // Create an SVG overlay with the bounding boxes
      const svgFilename = `debug_overlay_${timestamp}.svg`;
      const svgPath = path.join(this.debugDir, svgFilename);
      
      // Get image dimensions
      const dimensions = await this.getImageDimensions(screenshot);
      
      let boundingBoxesSVG = '';
      
      // Add chosen box (the element the action is being performed on)
      if (response.chosen_element_index !== undefined && response.boxes && response.boxes.length > response.chosen_element_index) {
        const chosenBox = response.boxes[response.chosen_element_index];
        const action = response.chosen_action.action || 'Action';
        const width = chosenBox.bbox.x2 - chosenBox.bbox.x1;
        const height = chosenBox.bbox.y2 - chosenBox.bbox.y1;
        
        boundingBoxesSVG += `
          <rect x="${chosenBox.bbox.x1}" y="${chosenBox.bbox.y1}" width="${width}" height="${height}" 
                fill="none" stroke="red" stroke-width="3" />
          <text x="${chosenBox.bbox.x1}" y="${chosenBox.bbox.y1 - 5}" 
                fill="red" font-family="Arial" font-size="14">${action}</text>
        `;
      }
      
      // Add all detected elements' bounding boxes
      if (response.boxes) {
        response.boxes.forEach((box, index) => {
          // Skip the chosen one as we already added it with different styling
          if (index === response.chosen_element_index) return;
          
          const bbox = box.bbox;
          const width = bbox.x2 - bbox.x1;
          const height = bbox.y2 - bbox.y1;
          
          boundingBoxesSVG += `
            <rect x="${bbox.x1}" y="${bbox.y1}" width="${width}" height="${height}" 
                  fill="none" stroke="green" stroke-width="2" stroke-opacity="0.6" />
            <text x="${bbox.x1}" y="${bbox.y1 - 5}" 
                  fill="green" font-family="Arial" font-size="12">Element ${index}</text>
          `;
        });
      }
      
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}">
          <image href="data:image/png;base64,${screenshot.toString('base64')}" width="${dimensions.width}" height="${dimensions.height}" />
          ${boundingBoxesSVG}
        </svg>
      `;
      
      fs.writeFileSync(svgPath, svg);
      
      // Create a PNG version with bounding boxes by drawing directly on a copy of the screenshot
      const pngWithBoxesFilename = `debug_with_boxes_${timestamp}.png`;
      const pngWithBoxesPath = path.join(this.debugDir, pngWithBoxesFilename);
      
      // Use the current page to render the SVG and take a screenshot
      // Store the current URL to navigate back to it
      const currentUrl = this.page.url();
      
      // Create a simple HTML page with just the SVG
      const tempHtmlPath = path.join(this.debugDir, `temp_${timestamp}.html`);
      const tempHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body, html { margin: 0; padding: 0; overflow: hidden; }
            svg { display: block; }
          </style>
        </head>
        <body>
          ${svg}
        </body>
        </html>
      `;
      fs.writeFileSync(tempHtmlPath, tempHtml);
      
      try {
        // Navigate to the temp HTML file
        await this.page.goto(`file://${tempHtmlPath}`);
        
        // Take a screenshot of the rendered SVG
        await this.page.screenshot({ path: pngWithBoxesPath });
        
        // Navigate back to the original URL
        await this.page.goto(currentUrl);
        
        // Delete the temporary HTML file
        fs.unlinkSync(tempHtmlPath);
      } catch (error) {
        console.error('Error creating PNG with bounding boxes:', error);
        // Make sure we navigate back to the original URL even if there's an error
        await this.page.goto(currentUrl);
      }
      
      // Create an HTML file that references both the original image and the SVG
      const htmlFilename = `debug_${timestamp}.html`;
      const htmlPath = path.join(this.debugDir, htmlFilename);
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Debug View - ${timestamp}</title>
          <style>
            body { margin: 20px; font-family: Arial, sans-serif; }
            h1 { color: #333; }
            .visualization { margin-bottom: 30px; }
            .raw-img { max-width: 100%; border: 1px solid #ddd; margin-top: 20px; }
            .info {
              margin: 20px 0;
              padding: 15px;
              background: #f5f5f5;
              border: 1px solid #ddd;
              font-family: monospace;
              white-space: pre-wrap;
            }
            .links a {
              display: inline-block;
              margin-right: 20px;
              color: #0066cc;
            }
          </style>
        </head>
        <body>
          <h1>Debug Visualization</h1>
          
          <div class="visualization">
            <h2>Visualization with Bounding Boxes</h2>
            <img src="${pngWithBoxesFilename}" alt="Visualization with boxes" class="raw-img">
          </div>
          
          <div class="info">
            <h3>Response Information:</h3>
            <div>Action: ${response.chosen_action.action}</div>
            <div>Confidence: ${response.chosen_action.confidence || 'N/A'}</div>
            <div>Chosen element index: ${response.chosen_element_index}</div>
            <div>Explanation: ${response.explanation || 'N/A'}</div>
          </div>
          
          <div class="links">
            <a href="${responseFilename}" target="_blank">View full response JSON</a>
            <a href="${imageFilename}" target="_blank">View original screenshot</a>
            <a href="${svgFilename}" target="_blank">View SVG version</a>
          </div>
        </body>
        </html>
      `;
      
      fs.writeFileSync(htmlPath, html);
      
      console.log(`Debug PNG with boxes saved to: ${pngWithBoxesPath}`);
      console.log(`Debug SVG overlay saved to: ${svgPath}`);
      console.log(`Debug HTML view saved to: ${htmlPath}`);
      console.log(`Debug response saved to: ${responsePath}`);
    } catch (error) {
      console.error('Error saving debug with bounding boxes:', error);
    }
  }
  
  private async getImageDimensions(imageBuffer: Buffer): Promise<{width: number, height: number}> {
    // Simple PNG dimension extraction
    // PNG dimensions are stored at bytes 16-24
    if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) {
      const width = imageBuffer.readUInt32BE(16);
      const height = imageBuffer.readUInt32BE(20);
      return { width, height };
    }
    
    // Fallback to a reasonable default if we can't determine dimensions
    return { width: 1280, height: 800 };
  }
} 