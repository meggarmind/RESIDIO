# Estate AI Assistant

## Overview

The Estate AI Assistant is a floating chatbot widget designed to provide residents and admins with quick answers and assistance. It is currently implemented as a mock prototype with a simulated response delay, ready for future integration with actual LLM services (e.g., OpenAI or Anthropic).

## Features

- **Floating Widget**: Accessible from anywhere in the application via a floating action button (FAB).
- **Animated UI**: Uses `framer-motion` for smooth open/close and message animations.
- **Typing Indicators**: Simulates "thinking" state for a more natural interaction.
- **Context Awareness**: Greets the user by name (if logged in) and references the estate name.
- **Customizable Name**: The assistant's name can be configured in the General Settings.

## Technical Implementation

### Files

- **Component**: `src/components/layout/estate-ai-assistant.tsx` - The UI component.
- **Hook**: `src/hooks/use-ai-assistant.ts` - Logic for state management and simulated responses.
- **Integration**: `src/app/layout.tsx` - Included globally at the root layout level.
- **Visibility Toggle**: `src/components/dashboard/header.tsx` - "Show AI Assistant" dropdown option when dismissed.

### Usage

The assistant is automatically managed by the `useAiAssistant` hook. It:

1. reads the `assistant_name` from system settings.
2. initializes a greeting message for the logged-in user.
3. manages the chat history and open/close state.

### Future Improvements (Roadmap)

- **Real LLM Integration**: Connect to an API route that calls an AI provider.
- **RAG (Retrieval-Augmented Generation)**: Allow the AI to query estate documents and announcements to provide accurate answers.
- **Actions**: Enable the AI to perform actions like "Show me my latest invoice" or "Register a visitor".
- **Role-Based Responses**: Tailor answers based on whether the user is a resident or an admin.
