import dotenv from 'dotenv';
import { Configuration, OpenAIApi } from 'openai';
import readline from 'readline';
import ora from 'ora';
import cliMd from 'cli-markdown';
import { google as googleapis } from 'googleapis';
const google = googleapis.customsearch('v1').cse;

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: (line) => {
    const completions = ['clear', 'exit', 'abc', 'aabc', 'accb']; // predefined list of commands
    const hits = completions.filter((match) =>
      match.startsWith(line.toLowerCase())
    ); // filter the list based on what user has entered so far

    // If there are matching commands, return those. Otherwise, return the full list.
    return [hits.length ? hits : completions, line];
  },
});

const config = {
  intro: [
    'Available commands:',
    ' * clear: Clears chat history',
    ' * exit/quit/q: Exit the program',
  ],
  chatApiParams: {
    model: 'gpt-3.5-turbo',
    max_tokens: 2048,
  },
  systemPrompts: [
    'Always use code blocks with the appropriate language tags.',
    'If the question needs real-time information that you may not have access to, simply reply with "I do not have real-time information"',
  ],
  keywordForWeb: [
    'not have access to real-time',
    "don't access to real-time",
    'not able to provide real-time',
    "I don't have real-time access",
    'not have real-time',
  ],
  googleSearchAuth: {
    auth: process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
    cx: process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID,
  },
  openaiAuth: {
    organization: process.env.OPENAI_ORG_ID,
    apiKey: process.env.OPENAI_API_KEY,
  },
};

const openai = new OpenAIApi(new Configuration(config.openaiAuth));

const googleSearch = (query) =>
  google
    .list(Object.assign(config.googleSearchAuth, { q: query }))
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

const chat = (messages) =>
  openai.createChatCompletion(
    Object.assign(config.chatApiParams, { messages: messages })
  );
const output = (message) => {
  history.push(message);
  const result = message.content.includes('```')
    ? cliMd(message.content).trim()
    : message.content;
  return Promise.resolve(console.log(result));
};

const needWebBrowsing = (response) =>
  config.keywordForWeb.some((frag) => response.toLowerCase().includes(frag));
const newHistory = () =>
  config.systemPrompts.map((prompt) => {
    return { role: 'system', content: prompt };
  });
//let history = Array.from(config.systemPrompts); // create a new array using Array.from() instead of shallow copy;
const history = newHistory();
rl.setPrompt('> ');

const promptAndResume = () => {
  rl.resume();
  console.log(
    '────────────────────────────────────────────────────────────────────────────────────'
  );
  rl.prompt();
};

config.intro.forEach((line) => console.log(line));
promptAndResume();

rl.on('line', (line) => {
  switch (line.toLowerCase().trim()) {
    case 'clear':
      history = newHistory();
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
    default:
      rl.pause();
      history.push({ role: 'user', content: line });
      const spinner = ora().start('');
      chat(history)
        .then(async (res) => {
          spinner.stop();
          if (needWebBrowsing(res.data.choices[0].message.content)) {
            return googleSearch(line).then((text) =>
              Promise.resolve(console.log(text))
            );
          } else {
            return output(res.data.choices[0].message);
          }
        })
        //.catch((err) => spinner.fail(err.message))
        .catch((err) => console.error(err.stack))
        .finally(promptAndResume);
  }
});
