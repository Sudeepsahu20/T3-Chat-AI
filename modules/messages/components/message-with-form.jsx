"use client";

import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { useSearchParams, useRouter } from "next/navigation";
import { RotateCcwIcon, SendIcon } from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Spinner } from "@/components/ui/spinner";

import { useChatStore } from "@/modules/chat/store/chat-store";
import { useAIModels } from "@/modules/ai-agent/hook/ai-agent";
import { useGetChatById } from "@/modules/chat/hooks/chat";
import { ModelSelector } from "@/modules/chat/components/model-selector";



export default function MessageViewWithForm({ chatId }) {
  const { data: models, isPending: isModelLoading } = useAIModels();
  const { data, isPending } = useGetChatById(chatId);
  const { hasChatBeenTriggered, markChatAsTriggered } = useChatStore();
  
  const [selectedModel, setSelectedModel] = useState(null);
  const [input, setInput] = useState("");

  const searchParams = useSearchParams();
  const router = useRouter();
  const shouldAutoTrigger = searchParams.get("autoTrigger") === "true";
  const hasAutoTriggered = useRef(false);

 
  const initialMessages = useMemo(() => {
    if (!data?.data?.messages) return [];

    return data.data.messages
      .filter((m) => m.content && m.id)
      .map((m) => {
        try {
          const parts = JSON.parse(m.content);
          return {
            id: m.id,
            role: m.messageRole.toLowerCase(),
            parts: Array.isArray(parts)
              ? parts
              : [{ type: "text", text: m.content }],
          };
        } catch {
          return {
            id: m.id,
            role: m.messageRole.toLowerCase(),
            parts: [{ type: "text", text: m.content }],
          };
        }
      });
  }, [data]);


  const { messages, status, sendMessage, stop } = useChat({
    api: "/api/chat",
    initialMessages: [],
  });

 
  useEffect(() => {
    if (data?.data?.model && !selectedModel) {
      setSelectedModel(data.data.model);
    }
  }, [data, selectedModel]);


  useEffect(() => {
    if (
      !shouldAutoTrigger ||
      hasAutoTriggered.current ||
      hasChatBeenTriggered(chatId) ||
      !selectedModel ||
      initialMessages.length === 0
    )
      return;

    const last = initialMessages[initialMessages.length - 1];
    if (last.role !== "user") return;

    hasAutoTriggered.current = true;
    markChatAsTriggered(chatId);

    sendMessage(
      { text: null },
      {
        body: {
          model: selectedModel,
          chatId,
          skipUserMessage: true,
        },
      }
    );

    router.replace(`/chat/${chatId}`, { scroll: false });
  }, [
    shouldAutoTrigger,
    chatId,
    selectedModel,
    initialMessages,
    sendMessage,
    markChatAsTriggered,
    hasChatBeenTriggered,
    router,
  ]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim()) return;

    sendMessage(
      { text: input },
      {
        body: {
          model: selectedModel,
          chatId,
        },
      }
    );
    setInput("");
  };

  const handleRetry = () => {
    const allMessages = [...initialMessages, ...messages];

    const lastUserMessage = [...allMessages]
      .reverse()
      .find((m) => m.role === "user");

    if (!lastUserMessage) return;

    sendMessage(
      { text: lastUserMessage.parts?.[0]?.text || "" },
      {
        body: {
          model: selectedModel,
          chatId,
          skipUserMessage: true,
        },
      }
    );
  };

  const messageToRender = [...initialMessages, ...messages];

  const canRetry =
    messageToRender.length > 0 &&
    messageToRender[messageToRender.length - 1]?.role === "assistant" &&
    status !== "streaming";

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col p-6">
      <Conversation className="flex-1">
        <ConversationContent>
          {messageToRender.map((message) => (
            <Fragment key={message.id}>
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <Message from={message.role} key={i}>
                      <MessageContent>{part.text}</MessageContent>
                    </Message>
                  );
                }

                if (part.type === "reasoning") {
                  return (
                    <Reasoning key={i} className="max-w-2xl">
                      <ReasoningTrigger />
                      <ReasoningContent>{part.text}</ReasoningContent>
                    </Reasoning>
                  );
                }

                return null;
              })}
            </Fragment>
          ))}

          {status === "streaming" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner />
              AI is thinking...
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* ------------------ INPUT ------------------ */}
      <form
        onSubmit={handleSubmit}
        className="mt-4 rounded-2xl border bg-background shadow-sm"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={status === "streaming"}
          className="w-full resize-none rounded-t-2xl px-4 py-3 outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />

        <div className="flex items-center justify-between border-t px-3 py-2">
          {/* Left */}
          <div className="flex items-center gap-2">
            {isModelLoading ? (
              <Spinner />
            ) : (
              <ModelSelector
                models={models?.models}
                selectedModelId={selectedModel}
                onModelSelect={setSelectedModel}
              />
            )}

            {canRetry && (
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-muted"
              >
                <RotateCcwIcon size={14} />
                Retry
              </button>
            )}
          </div>

          {/* Right */}
          <button
            type="submit"
            disabled={!input.trim() || status === "streaming"}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
          >
            {status === "streaming" ? <Spinner /> : <SendIcon size={16} />}
          </button>
        </div>
      </form>
    </div>
  );
}
