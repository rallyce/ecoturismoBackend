
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
    // Manejo de CORS para preflight
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
        if (!httpMethod) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: 'Método HTTP no definido' })
            };
        }
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
                if (!guestId) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: 'Se requiere el ID del huésped' })
                    };
                }
                if (!body) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: 'Se requiere un cuerpo en la solicitud' })
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
                error: error instanceof Error ? error.message : 'Error interno del servidor',
                ...(process.env.NODE_ENV === 'development' && error instanceof Error ? { stack: error.stack } : {})
            })
        };
    }
};
exports.handler = handler;
async function handleCreate(connection, body) {
    const data = JSON.parse(body);
    if (!data.name || !data.lastname || !data.identificationNumber || !data.phone) {
        throw new Error('Faltan campos requeridos: name, lastname, identificationNumber, phone');
    }
    const guestId = (0, uuid_1.v4)();
    await connection.execute(`INSERT INTO guest (guest_id, name, lastname, identificationType, identificationNumber, phone, emergencyPhone, reservation_id) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
        guestId,
        data.name,
        data.lastname,
        data.identificationType || 'Cédula de ciudadanía',
        data.identificationNumber,
        data.phone,
        data.emergencyPhone || null,
        data.reservation_id || null
    ]);
    return {
        statusCode: 201,
        headers: CORS_HEADERS,
        body: JSON.stringify({
            message: 'Huésped creado exitosamente',
            guest_id: guestId,
            ...data
        })
    };
}
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
    // Obtener el huésped actualizado para devolverlo
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