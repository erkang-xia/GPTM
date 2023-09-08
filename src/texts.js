export const texts = {
  menu: `* clear           :Clears chat history',
* exit/quit/q     :Exit the program',
* copy            :Copy the last message to clickboard'
* down arror key  :For multi-line input
* history         :Load history
* speak/say       : Speak out last response`,

  systemPrompts: [
    'Use code blocks with language tags',
    'If the question needs real-time information that you may not have access to, reply with "I do not have real-time information" and nothing else',
  ],

  forceWebPrompt: '[web]',
  forceImgPrompt: '[img]',

  keywordForWeb: [
    'access to real-time',
    'not able to provide real-time',
    "don't have real-time",
    'not have real-time',
    'as of my training data',
    'as of september 2021',
    'cut-off date',
  ],

  messageForWeb: (
    text,
    question
  ) => `treat following information as facts: ${text}

          You don't need access to real-time information. Using the info above, take a best guess at answering ${question}. 
          Exclude any disclaimer. Be short and don't let me know the answer is based on the information I provide. 
          Pretend you know the info already, and you are answering this question first time.`,

  messageForPDF: (text) =>
    `The following information is extracted from a PDF document, summerize it. ${text}.`,

  line: '────────────────────────────────────────────────────────────────────────────────────',
};

export default texts;
