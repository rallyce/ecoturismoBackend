const mysql = require('mysql2/promise');

exports.handler = async (event) => {
  // TODO implement
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-CloudFront-Secret",
    },
    body: JSON.stringify({ message: "Successfull response" }),
  };

<<<<<<< HEAD
}

=======
 
  
};
>>>>>>> main
