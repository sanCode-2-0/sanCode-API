FROM node:12

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV PORT=6969 \
    NODE_ENV=production \
    MONGO_URI=mongodb://127.0.0.1:27017/sanCodeDB-test \
    MONGO_URI_PRODUCTION=mongodb+srv://task-roulette-user:briomar2020@briomarftw-learning-clu.brz27k3.mongodb.net/taskRoulette?retryWrites=true&w=majority

EXPOSE 6969

CMD ["npm", "dev"]
