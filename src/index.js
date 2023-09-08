import texts from './texts.js';
import History from './history.js';
import configurations from './configurations.js';
import fs from 'fs';
import {
  Configuration,
  OpenAIApi,
  ChatCompletionRequestMessageRoleEnum as Role,
} from 'openai';
import readline from 'readline';
import ora from 'ora';
import cliMd from 'cli-markdown';
import { google as googleapis } from 'googleapis';
import clipboard from 'clipboardy';
import { readPdfText } from 'pdf-text-reader';
import untildify from 'untildify';
import { encode } from 'gpt-3-encoder';

const history = new History();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: (line) => {
    const completions = ['clear', 'copy', 'exit', 'help']; // predefined list of commands
    const hits = completions.filter((match) =>
      match.startsWith(line.toLowerCase())
    ); // filter the list based on what user has entered so far

    // If there are matching commands, return those. Otherwise, return the full list.
    return [hits.length ? hits : completions, line];
  },
});

const newLinePlaceholder = '\u2008';
process.stdin.on('keypress', (letter, key) => {
  if (key?.name === 'down') {
    rl.write(newLinePlaceholder);
    process.stdout.write('\n');
  }
});

const google = googleapis.customsearch('v1').cse;
const openai = new OpenAIApi(new Configuration(configurations.openaiAuth));

const googleSearch = (query) =>
  google
    .list(Object.assign(configurations.googleSearchAuth, { q: query }))
    .then((response) =>
      response.data.items
        .filter((result) => result.snippet)
        .map((result) => result.snippet)
    )
    .then((results) =>
      results.length
        ? Promise.resolve(results.join('\n'))
        : Promise.reject('No search result found')
    );
const needWebBrowsing = (response) =>
  texts.keywordForWeb.some((frag) => response.toLowerCase().includes(frag));

const chat = (params) => {
  history.add(Role.User, params.message);
  const spinner = ora().start(params.spinnerMessage);
  return openai
    .createChatCompletion(
      Object.assign(configurations.chatApiParams, { messages: history.get() })
    )
    .then((res) => {
      spinner.stop();
      const message = res.data.choices[0].message;
      history.push(message);
      if (!params.nested && needWebBrowsing(message.content)) {
        return googleSearch(params.message).then((text) =>
          chat({
            message: texts.messageForWeb(text, params.message),
            spinnerMessage: `Browsing the internet...`,
            nested: true,
          })
        );
      } else {
        return Promise.resolve(
          console.log(
            message.content.includes('```')
              ? cliMd(message.content).trim()
              : message.content
          )
        );
      }
    })
    .catch((err) => console.error(err.stack))
    .finally(() => {
      if (!params.nested) promptAndResume();
    });
};
const docToText = (file) => {
  file = untildify(file);
  if (fs.existsSync(file)) {
    if (file.endsWith('.pdf'))
      return readPdfText(file).then((pages) =>
        pages.map((page) => page.lines).join('\n\n')
      );
    // TODO: support other file types like .txt and Word docs
  }
  return Promise.resolve();
};

rl.setPrompt('> ');

const promptAndResume = () => {
  rl.resume();
  console.log(texts.line);
  rl.prompt();
};

console.log(texts.menu);
promptAndResume();

rl.on('line', (line) => {
  switch (line.toLowerCase().trim()) {
    case 'h':
    case 'help':
      console.log(texts.menu);
      return promptAndResume();
    case 'clear':
      history.clear();
      console.log('Chat history is now cleared!');
      promptAndResume();
      return;
    case 'q':
    case 'quit':
    case 'exit':
      console.log('Bye!');
      process.exit();
    case '':
      return;

    case 'cp':
    case 'copy':
      const content = history
        .get()
        .findLast((item) => item.role === Role.Assistant)?.content;
      if (content) {
        clipboard.writeSync(content);
        console.log('Message Copied');
      } else console.warn('History is empty; nothing to copy');
      return promptAndResume();
    default:
      rl.pause();
      chat({
        message: line.replace(newLinePlaceholder, '\n'),
        spinnerMessage: `Asking ${configurations.chatApiParams.model}`,
        nested: false,
      });
  }
});
