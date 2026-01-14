"use server";


import db from "@/lib/db";
import { currentUser } from "@/modules/authentication/actions";
import { MessageRole, MessageType } from "@prisma/client";
import { revalidatePath } from "next/cache";


export const createMessageInChat = async (values , chatId) => {

    const user = await currentUser();

    if (!user) {
      return {
        success: false,
        message: "Unauthorized user"
      };
    }

    const { content, model } = values;

    if (!content || content.trim() === "") {
      return {
        success: false,
        message: "Message content is required"
      };
    }

    const userMessage = await db.message.create({
      data: {
        model,
        content,
        messageRole: MessageRole.USER,
        messageType: MessageType.NORMAL,
        chatId
      }
    });

       // Trigger Your AI here
   const res = await fetch("http://localhost:3000/api/chat" , {
      method: "POST",
      body: JSON.stringify({
        chatId: chatId,
        model: model,
        content: content
      })
    })

    const { text } = await res.json();
 console.log(model);
    console.log(content);

 

      const Assistantmessage = await db.message.create({
    data: {
      model,
      chatId: chatId,
      content: text,
      messageRole: MessageRole.ASSISTANT,
      messageType: MessageType.NORMAL,
    },
  });

  
  revalidatePath(`/chat/${chatId}`);
    return {
      success: true,
      message: "Chat created successfully",
      data: {
        userMessage,
        Assistantmessage
      }
    };   
}

//done
export const createChatWithMessage = async (values) => {
  try {
    const user = await currentUser();
    if (!user) return { success: false, message: "Unauthorized user" };

    const { content, model } = values;
    if (!content || !content.trim()) {
      return { success: false, message: "Message content is required" };
    }

    const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");

    // Create chat WITH initial user message
    const chat = await db.chat.create({
      data: {
        title,
        model,
        userId: user.id,
        messages: {
          create: {
            content,
            messageRole: MessageRole.USER,
            messageType: MessageType.NORMAL,
            model,
          },
        },
      },
      include: { messages: true }, // Include messages in response
    });

    revalidatePath("/");
    return { success: true, message: "Chat created successfully", data: chat };
  } catch (error) {
    console.error("Error creating chat:", error);
    return { success: false, message: "Failed to create chat" };
  }
};

//done
export const getAllChats = async () => {
  try {
    const user = await currentUser();

    if (!user) {
      return {
        success: false,
        message: "Unauthorized user"
      };
    }

    const chats = await db.chat.findMany({
      where: {
        userId: user.id
      },
      include: {
        messages: true
      },
      orderBy:{
        createdAt: "desc"
      }
    });

    // revalidatePath("/");
    return {
      success: true,
      message: "Chats fetched successfully",
      data: chats
    };  
    } catch (error) {
      console.error("Error fetching chats:", error);
      return {
        success: false,
        message: "Failed to fetch chats"
      };
    }

};

//done
export const getChatById = async (chatId) => {

    const user = await currentUser();

    if (!user) {
      return {
        success: false,
        message: "Unauthorized user"
      };
    }

  try {
    const chat = await db.chat.findUnique({
      where: {
        id: chatId,
        userId: user.id
      },
      include: {
        messages: true
      }
    });

    return {
      success: true,
      message: "Chat fetched successfully",
      data: chat
    };  
    } catch (error) {
      console.error("Error fetching chat:", error);
      return {
        success: false,
        message: "Failed to fetch chat"
      };
    }

};

//done
export const deleteChat = async(chatId) => {
  try {
    const user = await currentUser();

    if (!user) {
      return {
        success: false,
        message: "Unauthorized user"
      };
    }

    const chat = await db.chat.findUnique({
      where: {
        id: chatId,
        userId: user.id
      }
    });

    if (!chat) {
      return {
        success: false,
        message: "Chat not found"
      };
    }

    await db.chat.delete({
      where: {
        id: chatId
      }
    });
    revalidatePath(`/chat/${chatId}`);
    return {
      success: true,
      message: "Chat deleted successfully"
    };
  } catch (error) {
    console.error("Error deleting chat:", error);
    return {
      success: false,
      message: "Failed to delete chat"
    };
  }   

};