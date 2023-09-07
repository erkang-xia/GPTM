require('dotenv').config();
const readline = require('readline');
const ora = require('ora');
const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({
  organization: 'org-DVSylqsMSqgTBTBJGS6F7A0I',
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});
let history = [];
const config = {
  intro: [
    'Available commands:',
    ' 1. clear: Clears chat history',
    ' 2. exit: Exits the program',
  ],
  chatApiParams: {
    model: 'gpt-3.5-turbo',
    max_tokens: 2048,
  },
};

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
      history = [];
      console.log('Chat history is now cleared!');
      promptAndResume();
      return;
    case 'exit':
      process.exit();
    case '':
      return;
    default:
      rl.pause();
      history.push({ role: 'user', content: line });
      const spinner = ora().start('');
      openai
        .createChatCompletion(
          Object.assign(config.chatApiParams, { messages: history })
        )
        .then((res) => {
          spinner.stop();
          res.data.choices.forEach((choice) => {
            history.push(choice.message);
            console.log(choice.message.content);
          });
        })
        .catch((err) => spinner.fail(err))
        .finally(promptAndResume);
  }
});
