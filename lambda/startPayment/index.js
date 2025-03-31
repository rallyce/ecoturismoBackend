
exports.handler = async (event) => {
    return {
            statusCode: 200,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type,Authorization,X-CloudFront-Secret",
            },
            body: JSON.stringify({ message: "Hola" }),
    };

}