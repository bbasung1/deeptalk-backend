const swaggerAutogen = require('swagger-autogen')();

const doc = {
  info: {
    title: 'My API',
    description: '자동으로 생성된 Swagger 문서입니다.'
  },
  host: 'https://jamdeeptalk.com', // 실제 서버 포트에 맞게 수정
  schemes: ['https']
};

const outputFile = './swagger-output.json'; // 생성될 파일 경로
const endpointsFiles = ['./deeptalk.js']; // 라우트가 시작되는 설정 파일 (또는 routes/*.js)

// 문서를 생성한 후 서버를 실행하거나, 단순히 생성만 하도록 설정
swaggerAutogen(outputFile, endpointsFiles, doc);