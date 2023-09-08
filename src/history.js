import texts from './texts.js';
import { encode } from 'gpt-3-encoder';
import { ChatCompletionRequestMessageRoleEnum as Role } from 'openai';
export default class History {
  history = [];
  constructor() {
    texts.systemPrompts.map((prompt) => {
      this.history.push({ role: Role.System, content: prompt });
    });
  }
  add(role, content) {
    this.history.push({ role: role, content: content });
  }

  push(message) {
    this.history.push(message);
  }
  // push = (message) => {
  //   message.encoding = encode(message.content);
  //   message.numTokens = message.encoding.length;
  //   this.history.push(message);
  //   while (this.totalTokens() > config.chatApiParams.max_tokens) {
  //     const idx = this.history.findIndex((msg) => msg.role !== Role.System);
  //     if (idx < 0) break;
  //     this.history.splice(idx, 1);
  //   }
  // };

  // totalTokens = () =>
  //   this.history.map((msg) => msg.numTokens).reduce((a, b) => a + b, 0);

  clear() {
    this.history = [];
    texts.systemPrompts.map((prompt) => {
      this.history.push({ role: Role.System, content: prompt });
    });
  }
  get() {
    return this.history;
  }
  lastMessage = () =>
    this.history.findLast((item) => item.role === Role.Assistant);
}
