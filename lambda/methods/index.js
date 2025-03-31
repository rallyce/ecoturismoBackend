const mysql = require('mysql2/promise');
const axios = require("axios");
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

const SECRET_HEADER_NAME = "X-CloudFront-Secret";
const SECRET_HEADER_VALUE = "my-secret-key";

exports.handler = async (event) => {
  // TODO implement


  try {
    const secretHeader = event.headers?.[SECRET_HEADER_NAME.toLowerCase()];
    if (secretHeader !== SECRET_HEADER_VALUE) {
      return {
        statusCode: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization,X-CloudFront-Secret",
        },
        body: JSON.stringify({ message: "Forbidden: Invalid CloudFront request" }),
      };
    }

    let connection = await pool.getConnection();
    //const dynamo = await axios.get("https://7bapf7fj1j.execute-api.us-east-1.amazonaws.com/prod/hosting/6bab77f8-894f-45fa-ac87-56f86f7cf907");
    let response;
    let costo_ponderado;
    //let room1 = dynamo.data.room?.room_id; 

    let IdForReservations;

    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        body: JSON.stringify({ message: "CORS preflight successful" }),
      };
    }

    if (event.httpMethod == "GET") {
      try {
    
        if (event.httpMethod === "GET") {
          // Retrieve reservation_id from query parameters
          const reservationId = event.queryStringParameters?.reservation_id;
    
          if (!reservationId) {
            return {
              statusCode: 400,
              body: JSON.stringify({ message: "Missing reservation_id" }),
            };
          }
    
          // Query the database for the reservation
          const [rows] = await connection.execute(
            "SELECT * FROM reservations WHERE reservationId = ?",
            [reservationId]
          );
    
          // Release the connection
          connection.release();
    
          if (rows.length === 0) {
            return {
              statusCode: 404,
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,Authorization",
              },
              body: JSON.stringify({ message: "Reservation not found" }),
            };
          }
    
          return {
            statusCode: 200,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type,Authorization",
            },
            body: JSON.stringify({ reservation: rows[0] }),
          };
        }
    
        return {
          statusCode: 405,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
          },
          body: JSON.stringify({ message: "Method Not Allowed" }),
        };
      } catch (error) {
        return {
          statusCode: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
          },
          body: JSON.stringify({ error: error.message }),
        };
      }
    }

    if (event.httpMethod == "POST") {
      const body = JSON.parse(event.body);
      // Read table name from environment variable

      // Extract 'hotelId' from the path parameters
      
      const [rows2] = await connection.execute(
          `SELECT * FROM reservations
          WHERE (checkInDate <= ? AND checkOutDate >= ?)
          OR (checkInDate >= ? AND checkOutDate <= ?)`,
          [body.checkOutDate, body.checkInDate, body.checkInDate, body.checkOutDate]
      );

      if (rows2.length > 0) {
        response = "No se puede realizar la reserva porque la fecha elegida ya esta ocupada!."
        const result = response;
        return {
          statusCode: 403,
          headers: {
            "Access-Control-Allow-Origin": "*",  // Allow all origins (change if needed)
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization"
        },
          body: JSON.stringify({ result }),
      };

      } else {

         // Extract only the additional_id values

        let reservation_id = randomUUID(); 
        
        const checkInDate = body.checkInDate
        const checkOutDate = body.checkOutDate
        const userId = body.userId 
        const hotelId = body.hotelId
        const roomId = body.roomId


        const [costoBasicoquery] = await connection.execute(
          'SELECT cost FROM rooms WHERE hotelId = ?',
          [hotelId]
        );
        const costo_basico = parseFloat(costoBasicoquery[0].cost)
        const additionalIds = body.additionalServices.map(service => service.additional_id);

        const placeholders = additionalIds.map(() => "?").join(",");
        const query = `SELECT serviceId, cost FROM additionalServices WHERE serviceId IN (${placeholders})`;

        const [additionalServices] = await connection.execute(query, additionalIds);

        const subtotal2 = additionalServices.reduce((sum, row) => sum + parseFloat(row.cost), 0);

        let numAdults = body.numAdults
        let numChildren = body.numChildren
        let numInfants = body.numInfants
        let totalPeople = numAdults + numChildren + numInfants
        let porcentaje;
        let acumulado_adultos = 0;
        let acumulado_kids = 0;
        let suma;
        let totalReservation;

        if (numAdults > 0) {
          porcentaje = 0.3
          acumulado_adultos = numAdults * costo_basico * porcentaje
        }

        if (numChildren > 0) {
          porcentaje = 0.1
          acumulado_kids = numChildren * costo_basico * porcentaje
        }

        suma = acumulado_adultos + acumulado_kids

        costo_ponderado = suma + costo_basico;

        await connection.execute(`INSERT INTO reservations (reservationId, checkInDate, checkOutDate, userId, hotelId, roomId, basic_value, taxes_value, total_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
          [reservation_id, checkInDate, checkOutDate, userId, hotelId, roomId, 500, 19, 1000]
        );


        const [dateSubstraction] = await connection.execute(`SELECT DATEDIFF(checkOutDate, checkInDate) AS days_difference FROM reservations WHERE reservationId = ?`, 
        [reservation_id])

        const numberOfNights = dateSubstraction[0]?.days_difference || 0;
        let subtotal1 = numberOfNights * costo_ponderado 
        totalReservation = subtotal1 + subtotal2

        response = body.status

        const status = response;

        connection.release();
        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",  
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          },
          body: JSON.stringify({ status, reservation_id, checkInDate, checkOutDate, userId, hotelId, roomId, additionalServices, costo_basico, numAdults, numChildren, numInfants, totalPeople, subtotal1, subtotal2, totalReservation, numberOfNights }),
        };
       
      
      }

    }
    

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",  // Allow all origins (change if needed)
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization"
      },
      body: JSON.stringify({error }),
  };
    
  }

  
};