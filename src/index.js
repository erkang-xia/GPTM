import texts from './texts.js';
import History from './history.js';
import configurations from './configurations.js';
import Retriver from './retriver.js';
import {
  Configuration,
  OpenAIApi,
  ChatCompletionRequestMessageRoleEnum as Role,
} from 'openai';
import readline from 'readline';
import ora from 'ora';
import say from 'say';
import got from 'got';
import terminalImage from 'terminal-image';
import cliMd from 'cli-markdown';
import { google as googleapis } from 'googleapis';
import clipboard from 'clipboardy';

const history = new History();
const retriver = new Retriver();
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

const promptEngineer = (text) => {
  if (text.includes(texts.forceWebPrompt)) {
    text = text.replace(texts.forceWebPrompt, ' ').trim();
    return googleSearch(text).then((res) =>
      chat({
        message: texts.messageForWeb(res, text),
        spinnerMessage: `Browsing the internet...`,
        nested: false,
      })
    );
  } else if (text.includes(texts.forceImgPrompt)) {
    text = text.replace(texts.forceImgPrompt, ' ').trim();
    img(text);
  } else if (Retriver.isSupported(text)) {
    let spinner = ora().start();
    retriver
      .add(text)
      .then((_) => spinner.succeed(text))
      .then(promptAndResume);
  } else if (retriver.hasDocs) {
    retriver.query(text).then((docs) =>
      docs.length
        ? chat({
            message: texts.messageForDoc(docs, text),
            spinnerMessage: `Asking ${configurations.chatApiParams.model}`,
            nested: false,
          })
        : chat({
            message: text,
            spinnerMessage: `Asking ${configurations.chatApiParams.model}`,
            nested: false,
          })
    );
  } else {
    chat({
      message: text,
      spinnerMessage: `Asking ${configurations.chatApiParams.model}`,
      nested: false,
    });
  }
};

const img = (param) => {
  const spinner = ora().start('Generating Img..');
  return openai
    .createImage(Object.assign(configurations.imgApiParams, { prompt: param }))
    .then((response) => {
      console.log(response.data.data[0].url);
      return got(response.data.data[0].url).buffer();
    })
    .then((body) => terminalImage.buffer(body, { width: '50%', height: '50%' }))
    .then((res) => spinner.succeed('\n' + res))
    .catch((err) => console.error(err.stack))
    .finally(promptAndResume);
};

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

rl.setPrompt('> ');

const promptAndResume = () => {
  rl.resume();
  console.log(texts.line);
  rl.prompt();
};

console.log(texts.menu);
promptAndResume();

rl.on('line', (line) => {
  say.stop();
  line = line.replace(newLinePlaceholder, '\n').trim();
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
      return promptAndResume();
    case 'say':
    case 'speak': {
      const content = history.lastMessage()?.content;
      if (content) say.speak(content);
      else console.warn('No messages');
      return promptAndResume();
    }

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

    case 'history':
      const his = history.get();
      his.map((messgae) => console.log(messgae));
      return promptAndResume();
    default:
      rl.pause();
      promptEngineer(line);
  }
});
