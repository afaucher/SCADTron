import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { getModelDimensions, castRay } from "../utils/stlMeasurements";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  image?: string; // base64 data url
}

export const editCodeDeclaration: FunctionDeclaration = {
  name: "editCode",
  description: "Edit the OpenSCAD code. You can replace a specific target string with a new string, or replace the entire file.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        description: "The action to perform: 'replace_string' or 'replace_all'",
      },
      targetString: {
        type: Type.STRING,
        description: "The exact string to replace (only used if action is 'replace_string')",
      },
      replacementString: {
        type: Type.STRING,
        description: "The new string to insert",
      },
    },
    required: ["action", "replacementString"],
  },
};

export const takeScreenshotDeclaration: FunctionDeclaration = {
  name: "takeScreenshot",
  description: "Take a screenshot of the current 3D rendered model to see what it looks like.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const getModelDimensionsDeclaration: FunctionDeclaration = {
  name: "getModelDimensions",
  description: "Get the bounding box and dimensions (size) of the current 3D model.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const castRayDeclaration: FunctionDeclaration = {
  name: "castRay",
  description: "Cast a ray against the current 3D model to find intersections.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      origin: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER },
        description: "The [x, y, z] origin of the ray."
      },
      direction: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER },
        description: "The [x, y, z] direction vector of the ray. Will be normalized automatically."
      }
    },
    required: ["origin", "direction"],
  },
};

export async function sendMessageToAgent(
  messages: ChatMessage[],
  currentCode: string,
  logs: string,
  error: string | null,
  stlContent: string | null,
  onCodeEdit: (action: string, target?: string, replacement?: string) => void,
  onScreenshotRequest: () => Promise<string>
): Promise<string> {
  const systemInstruction = `You are an expert OpenSCAD developer. 
You help the user create and modify 3D models using OpenSCAD.
The user's current code is:
\`\`\`openscad
${currentCode}
\`\`\`

Recent compiler logs:
\`\`\`
${logs || "No recent logs."}
\`\`\`

${error ? `Current Compiler Error:\n${error}` : "The code currently compiles successfully."}

When the user asks for changes, you should use the 'editCode' tool to modify the code. 
Prefer 'replace_string' for small incremental changes. Make sure the 'targetString' exactly matches a portion of the current code.
If you need to rewrite the whole thing, use 'replace_all'.
If you want to see what the current model looks like, use the 'takeScreenshot' tool.

DEBUGGING TIP: If you need to verify positions, rotations, or variable values, you can add \`echo("DEBUG:", my_variable);\` to the OpenSCAD code. The output will appear in the "Recent compiler logs" in your next turn.

Be concise in your responses.`;

  const contents: any[] = messages.map(msg => {
    const parts: any[] = [];
    if (msg.text) {
      parts.push({ text: msg.text });
    }
    if (msg.image) {
      const base64Data = msg.image.split(',')[1];
      const mimeType = msg.image.split(';')[0].split(':')[1];
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      });
    }
    return {
      role: msg.role,
      parts
    };
  });

  let response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents,
    config: {
      systemInstruction,
      tools: [
        { functionDeclarations: [editCodeDeclaration, takeScreenshotDeclaration, getModelDimensionsDeclaration, castRayDeclaration] },
        { googleSearch: {} }
      ],
      toolConfig: { includeServerSideToolInvocations: true },
      temperature: 0.2,
    }
  });

  let finalResponseText = "";

  while (response.functionCalls && response.functionCalls.length > 0) {
    const functionResponses: any[] = [];
    
    for (const call of response.functionCalls) {
      if (call.name === "editCode") {
        const args = call.args as any;
        onCodeEdit(args.action, args.targetString, args.replacementString);
        functionResponses.push({
          name: call.name,
          response: { result: "Code updated successfully." }
        });
      } else if (call.name === "takeScreenshot") {
        const dataUrl = await onScreenshotRequest();
        functionResponses.push({
          name: call.name,
          response: { result: "Screenshot taken." },
          _dataUrl: dataUrl // Store temporarily
        });
      } else if (call.name === "getModelDimensions") {
        if (!stlContent) {
          functionResponses.push({
            name: call.name,
            response: { error: "No 3D model is currently rendered." }
          });
        } else {
          try {
            const dims = getModelDimensions(stlContent);
            functionResponses.push({
              name: call.name,
              response: dims || { error: "Could not compute dimensions." }
            });
          } catch (e) {
            functionResponses.push({
              name: call.name,
              response: { error: String(e) }
            });
          }
        }
      } else if (call.name === "castRay") {
        if (!stlContent) {
          functionResponses.push({
            name: call.name,
            response: { error: "No 3D model is currently rendered." }
          });
        } else {
          const args = call.args as any;
          try {
            const intersections = castRay(stlContent, args.origin, args.direction);
            functionResponses.push({
              name: call.name,
              response: { intersections }
            });
          } catch (e) {
            functionResponses.push({
              name: call.name,
              response: { error: String(e) }
            });
          }
        }
      }
    }

    // Append the model's response (including function calls) to history
    contents.push(response.candidates?.[0]?.content);

    // Append the function responses
    const userMessageParts: any[] = functionResponses.map(fr => ({
      functionResponse: {
        name: fr.name,
        response: fr.response
      }
    }));

    // If screenshot was taken, let's also append the image as a user message part
    for (const fr of functionResponses) {
      if (fr._dataUrl) {
        const base64Data = fr._dataUrl.split(',')[1];
        const mimeType = fr._dataUrl.split(';')[0].split(':')[1];
        userMessageParts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        });
      }
    }

    contents.push({
      role: "user",
      parts: userMessageParts
    });

    response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents,
      config: {
        systemInstruction,
        tools: [
          { functionDeclarations: [editCodeDeclaration, takeScreenshotDeclaration, getModelDimensionsDeclaration, castRayDeclaration] },
          { googleSearch: {} }
        ],
        toolConfig: { includeServerSideToolInvocations: true },
        temperature: 0.2,
      }
    });
  }

  return response.text || "";
}
