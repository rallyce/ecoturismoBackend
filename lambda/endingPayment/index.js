"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const promise_1 = __importDefault(require("mysql2/promise"));
const uuid_1 = require("uuid");
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
};
const getDbConnection = async () => {
    return promise_1.default.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: true },
    });
};
const handler = async (event) => {
    console.log('Incoming event:', JSON.stringify(event, null, 2));
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'CORS preflight response' })
        };
    }
    try {
        const connection = await getDbConnection();
        const { httpMethod, pathParameters, body } = event;
        const guestId = pathParameters?.guest_id;
        switch (httpMethod) {
            case 'POST':
                if (!body) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: 'Se requiere un cuerpo en la solicitud' })
                    };
                }
                return await handleCreate(connection, body);
            case 'GET':
                return guestId
                    ? await handleGetOne(connection, guestId)
                    : await handleGetAll(connection);
            case 'PUT':
                if (!guestId || !body) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({
                            error: !guestId ? 'Se requiere el ID del huésped' : 'Se requiere un cuerpo en la solicitud'
                        })
                    };
                }
                return await handleUpdate(connection, guestId, body);
            case 'DELETE':
                if (!guestId) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: 'Se requiere el ID del huésped' })
                    };
                }
                return await handleDelete(connection, guestId);
            default:
                return {
                    statusCode: 405,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: `Método ${httpMethod} no permitido` })
                };
        }
    }
    catch (error) {
        console.error('Error:', error);
        return {
            statusCode: error instanceof Error && error.message.includes('no encontrado') ? 404 : 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: error instanceof Error ? error.message : 'Error interno del servidor'
            })
        };
    }
};
exports.handler = handler;
async function handleCreate(connection, body) {
    // Parsear y normalizar a array
    const data = JSON.parse(body);
    const guests = Array.isArray(data) ? data : [data];
    // Validar campos requeridos
    const requiredFields = ['name', 'lastname', 'identificationNumber', 'phone'];
    const invalidGuests = guests.filter(guest => requiredFields.some(field => !guest[field]));
    if (invalidGuests.length > 0) {
        throw new Error(`Faltan campos requeridos en ${invalidGuests.length} huésped(es)`);
    }
    // Iniciar transacción
    await connection.beginTransaction();
    try {
        // Preparar datos con UUIDs
        const guestsWithIds = guests.map(guest => ({
            guest_id: (0, uuid_1.v4)(),
            name: guest.name,
            lastname: guest.lastname,
            identificationType: guest.identificationType || 'Cédula de ciudadanía',
            identificationNumber: guest.identificationNumber,
            phone: guest.phone,
            emergencyPhone: guest.emergencyPhone || null,
            reservation_id: guest.reservation_id || null
        }));
        // Inserción masiva de huéspedes
        await connection.query(`INSERT INTO guest 
        (guestId, name, lastname, identificationType, identificationNumber, phone, emergencyPhone, reservationId) 
       VALUES ?`, [guestsWithIds.map(g => [
                g.guest_id,
                g.name,
                g.lastname,
                g.identificationType,
                g.identificationNumber,
                g.phone,
                g.emergencyPhone,
                g.reservation_id
            ])]);
        // // ACTUALIZACIÓN DE PAYMENT (NUEVA FUNCIONALIDAD)
        // let paymentUpdated = false;
        // if (guests[0].reservation_id) {
        //   const [paymentResult] = await connection.execute(
        //     `UPDATE payments 
        //      SET status = 'Reserva en progreso' 
        //      WHERE paymentId IN (
        //        SELECT payment_id FROM reservation_payments WHERE reservation_id = ?
        //      ) AND status = 'Pendiente de pago'`,
        //     [guests[0].reservation_id]
        //   );
        //   paymentUpdated = (paymentResult as any).affectedRows > 0;
        // }
        // await connection.commit();
        // ACTUALIZACIÓN DE PAYMENT - VERSIÓN CORREGIDA
        let paymentUpdated = false;
        if (guests[0]?.reservation_id) {
            try {
                const [paymentResult] = await connection.execute(`
             UPDATE payments 
             SET status = 'Reserva en progreso' 
             WHERE reservation_id = ? 
             AND status = 'Pendiente de pago'
             `, [guests[0].reservation_id]);
                paymentUpdated = paymentResult.affectedRows > 0;
            }
            catch (error) {
                console.error('Error al actualizar estado de pago:', error);
                throw error;
            }
        }
        await connection.commit();
        return {
            statusCode: 201,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                message: guests.length > 1
                    ? `${guests.length} huéspedes creados exitosamente`
                    : 'Huésped creado exitosamente',
                count: guests.length,
                guests: guestsWithIds,
                paymentUpdated: paymentUpdated
            })
        };
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        await connection.end();
    }
}
// Los demás métodos permanecen EXACTAMENTE IGUAL como los tenías
async function handleGetAll(connection) {
    const [rows] = await connection.execute('SELECT * FROM guest');
    return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(rows)
    };
}
async function handleGetOne(connection, guestId) {
    const [rows] = await connection.execute('SELECT * FROM guest WHERE guest_id = ?', [guestId]);
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('Huésped no encontrado');
    }
    return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(rows[0])
    };
}
async function handleUpdate(connection, guestId, body) {
    const data = JSON.parse(body);
    const updates = Object.keys(data).map(key => `${key} = ?`).join(', ');
    const values = Object.values(data);
    if (!updates) {
        throw new Error('No hay campos para actualizar');
    }
    const [result] = await connection.execute(`UPDATE guest SET ${updates} WHERE guest_id = ?`, [...values, guestId]);
    if (!result.affectedRows) {
        throw new Error('Huésped no encontrado');
    }
    const [updatedRows] = await connection.execute('SELECT * FROM guest WHERE guest_id = ?', [guestId]);
    return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(Array.isArray(updatedRows) ? updatedRows[0] : {
            message: 'Huésped actualizado exitosamente',
            guest_id: guestId
        })
    };
}
async function handleDelete(connection, guestId) {
    const [result] = await connection.execute('DELETE FROM guest WHERE guest_id = ?', [guestId]);
    if (!result.affectedRows) {
        throw new Error('Huésped no encontrado');
    }
    return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
            message: 'Huésped eliminado exitosamente',
            guest_id: guestId
        })
    };
}