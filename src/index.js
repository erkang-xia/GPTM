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
    'Always use code blocks with the appropriate language tags',
    'If the question needs real-time information that you may not have access to, simply reply with "I do not have real-time information" and nothing else',
  ],
  keywordForWeb: [
    'not have access to real-time',
    "don't access to real-time",
    'not able to provide real-time',
    "don't have real-time",
    'not have real-time',
    'as of my training data',
    'as of september 2021',
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

const needWebBrowsing = (response) =>
  config.keywordForWeb.some((frag) => response.toLowerCase().includes(frag));
const newHistory = () =>
  config.systemPrompts.map((prompt) => {
    return { role: 'system', content: prompt };
  });
const chat = (params) => {
  history.push({ role: 'user', content: params.message });
  const spinner = ora().start(params.spinnerMessage);
  return openai
    .createChatCompletion(
      Object.assign(config.chatApiParams, { messages: history })
    )
    .then((res) => {
      spinner.stop();
      const message = res.data.choices[0].message;
      history.push(message);
      if (!params.nested && needWebBrowsing(message.content)) {
        return googleSearch(params.message).then((text) =>
          chat({
            message: `treat following information as facts:
        
            ${text}
            
          Using the above search results, take a best guess at answering ${params.message}. 
          Exclude any disclaimer.Be short and don't say "based on the search results". 
          Pretend you know the info I provided, and you are answering this question first time. 
        `,
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
      chat({
        message: line,
        spinnerMessage: `Asking ${config.chatApiParams.model}`,
        nested: false,
      });
  }
});
