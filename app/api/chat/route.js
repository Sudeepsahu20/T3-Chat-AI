import { convertToModelMessages, streamText } from "ai";
import { CHAT_SYSTEM_PROMPT } from "@/lib/prompt";
import db from "@/lib/db";
import { MessageRole, MessageType } from "@prisma/client";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const provider = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Converts stored DB message to UI-friendly format
function convertStoredMessageToUI(msg) {
  try {
    const parts = JSON.parse(msg.content);

    const validParts = parts.filter(part => part.type === "text");
    if (validParts.length === 0) return null;

    return {
      id: msg.id,
      role: msg.messageRole.toLowerCase(),
      parts: validParts,
      createdAt: msg.createdAt,
    };
  } catch {
    return {
      id: msg.id,
      role: msg.messageRole.toLowerCase(),
      parts: [{ type: "text", text: msg.content }],
      createdAt: msg.createdAt,
    };
  }
}

// Converts message parts to JSON string for DB save
function extractPartsAsJSON(message) {
  if (message.parts && Array.isArray(message.parts)) {
    return JSON.stringify(message.parts);
  }
  const content = message.content || "";
  return JSON.stringify([{ type: "text", text: content }]);
}

// Main API handler
export async function POST(req) {
  try {
    const { chatId, messages: newMessages, model, skipUserMessage } = await req.json();
    console.log("Chattttttt iiiddddd",chatId);
    // ✅ Ensure we always have a safe model
    const finalModel = model || "google/gemma-2-9b-it";
   console.log("using model",finalModel);
    // Fetch previous messages from DB
    const previousMessages = chatId
      ? await db.message.findMany({
          where: { chatId },
          orderBy: { createdAt: "asc" },
        })
      : [];

    // Convert DB messages to UI format
    const uiMessages = previousMessages
      .map(convertStoredMessageToUI)
      .filter(msg => msg !== null);

    // Normalize new messages
    const normalizedNewMessages = Array.isArray(newMessages) ? newMessages : [newMessages];

    console.log("📊 Previous messages:", uiMessages.length);
    console.log("📊 New messages:", normalizedNewMessages.length);

    // Combine previous + new messages
    const allUIMessages = [...uiMessages, ...normalizedNewMessages];

    // Convert to model messages (tool-safe)
    let modelMessages;
    try {
      modelMessages = convertToModelMessages(allUIMessages);
    } catch (error) {
      console.error("❌ Message conversion error:", error);
      modelMessages = allUIMessages
        .map(msg => ({
          role: msg.role,
          content: msg.parts
            .filter(p => p.type === "text")
            .map(p => p.text)
            .join("\n"),
        }))
        .filter(m => m.content);
    }

    console.log("🤖 Final model messages:", JSON.stringify(modelMessages, null, 2));

    // Stream AI response
    const result = streamText({
      model: provider.chat(finalModel),
      messages: modelMessages,
      system: CHAT_SYSTEM_PROMPT,
    });

    return result.toUIMessageStreamResponse({
      sendReasoning: true,
      originalMessages: allUIMessages,

      // Save messages to DB after AI response
      onFinish: async ({ responseMessage }) => {
        try {
          const messagesToSave = [];

          // Save latest user message (optional)
          if (!skipUserMessage) {
            const latestUserMessage = normalizedNewMessages[normalizedNewMessages.length - 1];
            if (latestUserMessage?.role === "user") {
              messagesToSave.push({
                chatId,
                content: extractPartsAsJSON(latestUserMessage),
                messageRole: MessageRole.USER,
                model: finalModel,
                messageType: MessageType.NORMAL,
              });
            }
          }

          // Save assistant response
          if (responseMessage?.parts?.length > 0) {
            messagesToSave.push({
              chatId,
              content: extractPartsAsJSON(responseMessage),
              messageRole: MessageRole.ASSISTANT,
              model: finalModel,
              messageType: MessageType.NORMAL,
            });
          }

          if (messagesToSave.length > 0) {
            await db.message.createMany({ data: messagesToSave });
            console.log("💾 Messages saved:", messagesToSave.length);
          }
        } catch (error) {
          console.error("❌ Error saving messages:", error);
        }
      },
    });
  } catch (error) {
    console.error("❌ API Route Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error", details: error.toString() }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
