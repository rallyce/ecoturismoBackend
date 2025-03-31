const mercadopago = require('mercadopago');

mercadopago.configure({
    access_token: 'TEST-5140728010257269-031420-3615c3df5b2c33c7c198389bbcbc1708-134035861'
});
exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body);

        const payment_data = {
            transaction_amount: body.amount,
            token: body.token,
            description: body.description,
            payment_method_id: body.paymentMethodId,
            payer: { email: body.email },
            installments: body.installments || 1 // Default to 1 if not provided
        };

        const response = await mercadopago.payment.create(payment_data);

        return {
            statusCode: 200,
            body: JSON.stringify(response.body)
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};