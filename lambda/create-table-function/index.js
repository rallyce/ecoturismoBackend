const mysql = require('mysql2/promise');
exports.handler = async (event) => {
const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
    });

    let con = await connection.getConnection();

    const table1 = 'CREATE TABLE IF NOT EXISTS Users (userId VARCHAR(255) PRIMARY KEY, document_number VARCHAR(50));'
    const table2 = 'CREATE TABLE IF NOT EXISTS Hotel (hotelId VARCHAR(255) PRIMARY KEY);'
    const table3 = 'CREATE TABLE IF NOT EXISTS rooms (roomId VARCHAR(255) PRIMARY KEY, hotelId VARCHAR(255), cost DECIMAL);'
    const table4 = 'CREATE TABLE IF NOT EXISTS additionalServices (serviceId VARCHAR(255) PRIMARY KEY, cost DECIMAL);'
    const table5 = `CREATE TABLE IF NOT EXISTS reservations (
        reservationId VARCHAR(100) PRIMARY KEY,
        checkInDate DATE,
        checkOutDate DATE,
        updatingDate DATE, 
        userId VARCHAR(255), 
        hotelId VARCHAR(255), 
        roomId VARCHAR(255),  
        basic_value DECIMAL, 
        taxes_value DECIMAL, 
        total_value DECIMAL
        );
    `;

    const table6 = `CREATE TABLE IF NOT EXISTS room_services (
    roomId VARCHAR(255),
    serviceId VARCHAR(255),
    PRIMARY KEY (roomId, serviceId)
    );
    `;

    const table7 = `CREATE TABLE IF NOT EXISTS guests (
        guestId VARCHAR(36) PRIMARY KEY,
        reservationId VARCHAR(36),
        name VARCHAR(100) NOT NULL,
        lastname VARCHAR(100) NOT NULL,
        identificationType VARCHAR(100) NOT NULL,
        identificationNumber VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        emergencyPhone VARCHAR(20) NOT NULL
        );
        `;

    const table8 = `CREATE TABLE IF NOT EXISTS payments (
        paymentId VARCHAR(255),
        payment_method VARCHAR(255),
        amount DECIMAL,
        PRIMARY KEY (paymentId)
        );
        `;

    const table9 = `CREATE TABLE IF NOT EXISTS reservations_payments (
        guestId VARCHAR(255),
        paymentId VARCHAR(255),
        PRIMARY KEY (guestId, paymentId)
        );
        `;



    const foreignKey1 = `ALTER TABLE reservations 
    ADD FOREIGN KEY (userId) REFERENCES Users(userId) ON DELETE CASCADE;`;

    const foreignKey2 = `ALTER TABLE reservations 
    ADD FOREIGN KEY (hotelId) REFERENCES Hotel(hotelId) ON DELETE CASCADE;`;

    const foreignKey3 = `ALTER TABLE rooms 
    ADD FOREIGN KEY (hotelId) REFERENCES Hotel(hotelId) ON DELETE CASCADE;`;

    const foreignKey4 = `ALTER TABLE reservations 
    ADD FOREIGN KEY (roomId) REFERENCES rooms(roomId) ON DELETE CASCADE;`;

    const foreignKey5 = `ALTER TABLE room_services
    ADD FOREIGN KEY (roomId) REFERENCES rooms(roomId) ON DELETE CASCADE;`;

    const foreignKey6 = `ALTER TABLE room_services 
    ADD FOREIGN KEY (serviceId) REFERENCES additionalServices(serviceId) ON DELETE CASCADE;`;

    const foreignKey7 = `ALTER TABLE guests 
    ADD FOREIGN KEY (reservationId) REFERENCES reservations(reservationId) ON DELETE CASCADE;`;

    const foreignKey8 = `ALTER TABLE reservations_payments 
    ADD FOREIGN KEY (guestId) REFERENCES guests(guestId) ON DELETE CASCADE;`;

    const foreignKey9 = `ALTER TABLE reservations_payments 
    ADD FOREIGN KEY (paymentId) REFERENCES payments(paymentId) ON DELETE CASCADE;`;


    await con.execute(table1)
    await con.execute(table2)
    await con.execute(table3)
    await con.execute(table4)
    await con.execute(table5)
    await con.execute(table6)
    await con.execute(table7)
    await con.execute(table8)
    await con.execute(table9)
    await con.execute(foreignKey1)
    await con.execute(foreignKey2)
    await con.execute(foreignKey3)
    await con.execute(foreignKey4)
    await con.execute(foreignKey5)
    await con.execute(foreignKey6)
    await con.execute(foreignKey7)
    await con.execute(foreignKey8)
    await con.execute(foreignKey9)

    con.release();
    
    return { statusCode: 200, body: 'Tables created and updated successfully' };
};