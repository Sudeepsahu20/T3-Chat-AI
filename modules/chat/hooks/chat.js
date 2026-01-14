import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createChatWithMessage,
  createMessageInChat,
  deleteChat,
  getAllChats,
  getChatById,
} from "../actions";
import { useRouter } from "next/navigation";
import { useChatStore } from "../store/chat-store";
import { da } from "zod/v4/locales";
import { useChat } from "@ai-sdk/react";
import { toast } from "sonner";

export const useGetChats = () => {
  return useQuery({
    queryKey: ["chats"],
    queryFn: getAllChats,
  });
};

export const useCreateMessageInChat = (chatId) => {
  const queryClient = useQueryClient();
  const { addMessage, setMessages, messages } = useChatStore();

  return useMutation({
    mutationFn: (values) => createMessageInChat(values, chatId),
    // Optimistic update: update both the zustand store and React Query cache
    onMutate: async (values) => {
      // Cancel any outgoing refetches for this chat so they don't overwrite our optimistic update
      await queryClient.cancelQueries(["chats", chatId]);

    
      const previousChat = queryClient.getQueryData(["chats", chatId]);
      const previousMessages = previousChat?.data?.messages ?? messages;

      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        content: values.content,
        messageRole: "USER",
        messageType: "NORMAL",
        model: values.model ?? null,
        createdAt: new Date().toISOString(),
      };

      // Update zustand store immediately
      addMessage(optimisticMessage);
      setMessages([...previousMessages, optimisticMessage]);

      
      const optimisticChat = previousChat
        ? {
            ...previousChat,
            data: {
              ...previousChat.data,
              messages: [...previousMessages, optimisticMessage],
            },
          }
        : {
            success: true,
            message: "optimistic-chat",
            data: {
              id: chatId,
              title: "",
              model: values.model ?? null,
              userId: null,
              messages: [...previousMessages, optimisticMessage],
            },
          };

      queryClient.setQueryData(["chats", chatId], optimisticChat);

      return { previousChat, previousMessages };
    },

    onError: (_error, _variables, context) => {
      // Rollback zustand store
      if (context?.previousMessages) {
        setMessages(context.previousMessages);
      }

      // Rollback React Query cache
      if (context?.previousChat) {
        queryClient.setQueryData(["chats", chatId], context.previousChat);
      }

      // Ensure chats list is refreshed
      queryClient.invalidateQueries(["chats"]);
    },

    onSuccess: (res, _variables, context) => {
      if (res.success && res.data) {
        const { userMessage, Assistantmessage } = res.data;

        
        const newMessages = (context?.previousMessages || []).concat(userMessage);
        if (Assistantmessage) newMessages.push(Assistantmessage);

        
        setMessages(newMessages);

     
        const previousChat = context?.previousChat;
        if (previousChat) {
          const updatedChat = {
            ...previousChat,
            data: {
              ...previousChat.data,
              messages: newMessages,
            },
          };
          queryClient.setQueryData(["chats", chatId], updatedChat);
        }

   
        queryClient.invalidateQueries(["chats"]);
      }
    },
  });
};

//done
export const useCreateChat = () => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { addChat, setActiveChatId, setMessages } = useChatStore();

  return useMutation({
    mutationFn: (values) => createChatWithMessage(values),
    onSuccess: (res) => {
      if (res.success && res.data) {
        const chat = res.data;
        addChat(chat);
        setActiveChatId(chat.id);
        
        // Set messages from the created chat
        setMessages(chat.messages || []);
        
        queryClient.invalidateQueries(["chats"]);
        
        // Redirect WITH autoTrigger to stream AI response
        router.push(`/chat/${chat.id}?autoTrigger=true`);
      }
    },
    onError: (error) => {
      console.error("Create chat error:", error);
      toast.error("Failed to create chat");
    },
  });
};

//done
export const useGetChatById = (chatId) => {
  return useQuery({
    queryKey: ["chats", chatId],
    queryFn: () => getChatById(chatId),
 
  });
};

//done
export const useDeleteChat = (chatId) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => deleteChat(chatId),
    onSuccess: () => {
      queryClient.invalidateQueries(["chats"]);
      router.push("/");
    },
    onError: () => {
      toast.error("Failed to delete chat");
    },
  });
};