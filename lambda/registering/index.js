const mysql = require('mysql2/promise');
const { randomUUID } = require("crypto");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

exports.handler = async (event) => {
  // TODO implement


  try {

    let connection = await pool.getConnection();


    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-CloudFront-Secret",
        },
        body: JSON.stringify({ message: "CORS preflight successful" }),
      };
    }
    


    if (event.httpMethod == "POST") {
      const body = JSON.parse(event.body);

      let userId = randomUUID();
      let hotelId = body.id
      let roomId = body.room.room_id
      let roomCost = body.room.price_per_night
    

      await connection.execute(`INSERT IGNORE INTO Users(userId) VALUES (?)`,
          [userId]    
      );

      await connection.execute(`INSERT IGNORE INTO Hotel(hotelId) VALUES (?)`,
          [hotelId]    
      );

      await connection.execute(`INSERT IGNORE INTO rooms (roomId, hotelId, cost) VALUES (?, ?, ?)`,
          [roomId, hotelId, roomCost]    
      );

      let additionalServices = body.additional

      for (const service of additionalServices) {
        // Insert into services table (if not exists)
          await connection.execute(
            `INSERT INTO additionalServices (serviceId, cost) VALUES (?, ?) 
             ON DUPLICATE KEY UPDATE cost = VALUES(cost)`,
            [service.additional_id, service.cost]
          );
         

        // Insert into reservation_services table (linking reservation and services)
          await connection.execute(
            `INSERT INTO room_services (roomId, serviceId) VALUES (?, ?)`,
            [roomId, service.additional_id]
          );
      }

      connection.release();
      return {
          statusCode: 200,
          headers: {
          "Access-Control-Allow-Origin": "*",  
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-CloudFront-Secret"
          },
          body: JSON.stringify({ userId, hotelId, roomId, roomCost }),
    };
       
      
      

    }
    

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",  // Allow all origins (change if needed)
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-CloudFront-Secret"
      },
      body: JSON.stringify({error }),
  };
    
  }

  
};