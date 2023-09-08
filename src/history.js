import texts from './texts.js';
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
  clear() {
    this.history = [];
    texts.systemPrompts.map((prompt) => {
      this.history.push({ role: Role.System, content: prompt });
    });
  }
  get() {
    return this.history;
  }
}
