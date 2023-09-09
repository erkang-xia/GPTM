// Import document loaders for different file formats
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { JSONLoader } from 'langchain/document_loaders/fs/json';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { CSVLoader } from 'langchain/document_loaders/fs/csv';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';

// Import OpenAI language model and other related modules
import { OpenAI } from 'langchain/llms/openai';
import { RetrievalQAChain } from 'langchain/chains';
import { HNSWLib } from 'langchain/vectorstores/hnswlib';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import configurations from './configurations.js';

// Import Tiktoken for token counting
import { Tiktoken } from '@dqbd/tiktoken/lite';
import { load } from '@dqbd/tiktoken/load';
import registry from '@dqbd/tiktoken/registry.json' assert { type: 'json' };
import models from '@dqbd/tiktoken/model_to_encoding.json' assert { type: 'json' };

// Import dotenv for loading environment variables and fs for file system operations
import untildify from 'untildify';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

export default class Retriver {
  VECTOR_STORE_PATH = 'Documents.index';
  costLimit = 1;

  static embeddings = new OpenAIEmbeddings({
    openAIApiKey: configurations.openaiAuth.apiKey,
  });
  static textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });
  constructor() {
    this.clear();
  }
  clear = () => {
    this.vectorStore = new MemoryVectorStore(Retriver.embeddings);
    this.hasDocs = false;
  };

  static isSupported = (file) => {
    file = untildify(file);
    return (
      fs.existsSync(file) &&
      (file.endsWith('.pdf') ||
        file.endsWith('.json') ||
        file.endsWith('.txt') ||
        file.endsWith('.csv'))
    );
  };

  static toText = (file) => {
    file = untildify(file);
    if (!fs.existsSync(file)) return Promise.reject(`Missing file: ${file}`);
    if (file.endsWith('.pdf')) return new PDFLoader(file).load();
    if (file.endsWith('.txt')) return new TextLoader(file).load();
    if (file.endsWith('.csv')) return new CSVLoader(file).load();
    if (file.endsWith('.json')) return new JSONLoader(file).load();

    return Promise.reject('Unsupported file type');
  };

  // Define a function to calculate the cost of tokenizing the documents
  static async calculateCost(docs) {
    const modelName = 'text-embedding-ada-002';
    const modelKey = models[modelName];
    const model = await load(registry[modelKey]);
    const encoder = new Tiktoken(
      model.bpe_ranks,
      model.special_tokens,
      model.pat_str
    );
    const tokens = encoder.encode(JSON.stringify(docs));
    const tokenCount = tokens.length;
    const ratePerThousandTokens = 0.0004;
    const cost = (tokenCount / 1000) * ratePerThousandTokens;
    encoder.free();
    return cost;
  }

  //Define a function to normalize the content of the documents
  static normalizeDocuments(docs) {
    return docs.map((doc) => {
      if (typeof doc.pageContent === 'string') {
        return doc.pageContent;
      } else if (Array.isArray(doc.pageContent)) {
        return doc.pageContent.join('\n');
      }
    });
  }

  //  Define the main function to run the entire process
  askDir = async (params) => {
    //Initialize the document loader with supported file formats
    const loader = new DirectoryLoader(params.path, {
      '.json': (path) => new JSONLoader(path),
      '.txt': (path) => new TextLoader(path),
      '.csv': (path) => new CSVLoader(path),
      '.pdf': (path) => new PDFLoader(path),
    });

    // Load documents from the specified directory
    console.log('Loading docs...');
    const docs = await loader.load();
    console.log('Docs loaded.');

    // Calculate the cost of tokenizing the documents
    console.log('Calculating cost...');
    const cost = await calculateCost(docs);
    console.log('Cost calculated:', cost);

    // Check if the cost is within the acceptable limit
    if (cost <= this.costLimit) {
      // Initialize the OpenAI language model
      const model = new OpenAI({
        openAIApiKey: configurations.openaiAuth.apiKey,
      });

      // Check if an existing vector store is available
      console.log('Checking for existing vector store...');
      if (fs.existsSync(VECTOR_STORE_PATH)) {
        // Load the existing vector store
        console.log('Loading existing vector store...');
        this.vectorStore = await HNSWLib.load(VECTOR_STORE_PATH, embeddings);
        console.log('Vector store loaded.');
      } else {
        // Create a new vector store if one does not exist
        console.log('Creating new vector store...');
        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1000,
        });
        const normalizedDocs = normalizeDocuments(docs);
        const splitDocs = await textSplitter.createDocuments(normalizedDocs);

        // Generate the vector store from the documents
        vectorStore = await HNSWLib.fromDocuments(splitDocs, embeddings);
        // Save the vector store to the specified path
        await vectorStore.save(VECTOR_STORE_PATH);

        console.log('Vector store created.');
      }

      // Create a retrieval chain using the language model and vector store
      console.log('Creating retrieval chain...');
      const chain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever());

      // Query the retrieval chain with the specified question
      console.log('Querying chain...');
      const res = await chain.call({ query: params.question });
      console.log({ res });
    } else {
      // If the cost exceeds the limit, skip the embedding process
      console.log(
        `The cost of embedding exceeds ${this.costLimit}. Skipping embeddings.`
      );
    }
  };
  //------------------------------------------------------------------------
  add = async (file) => {
    console.log('here');
    return Retriver.toText(file)
      .then((docs) => Retriver.textSplitter.splitDocuments(docs))
      .then((docs) => this.vectorStore.addDocuments(docs))
      .then((_) => (this.hasDocs = true));
  };

  query = (query) =>
    this.vectorStore.similaritySearch(query, Math.floor(2048 / 1000));
}
