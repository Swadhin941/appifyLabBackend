const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const jwt= require('jsonwebtoken');
const ACCESS_TOKEN= process.env.ACCESS_TOKEN;


//Middlewares
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.wxzkvmx.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const run = async () => {
    const Users = client.db('miniSocial').collection('User');

    try {
        app.post('/user', async (req, res) => {
            const userData = req.body;
            const checkEmail = await Users.find({ email: userData }).toArray();
            if (checkEmail.length === 0) {
                const result = await Users.insertOne(userData);
                return res.send(result);
            }
            else {
                return res.send({ acknowledged: true });
            }
        });

        app.post('/jwt', async(req, res)=>{
            const email= req.body.email;
            const token= jwt.sign({email}, ACCESS_TOKEN, {expiresIn: "1h"});
            res.send({token});
        })
    }
    finally {

    }
}
run()
    .catch(error => {
        console.log(error.message);
    })


app.get('/', (req, res) => {
    res.send('appifylab root link');
})

app.listen(port, () => {
    console.log(`appifyLab port opening  ${port}`);
})