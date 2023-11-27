const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;


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

const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "Un-authorize Access" });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, ACCESS_TOKEN, function (error, decoded) {
        if (error) {
            return res.status(401).send({ message: "Un-authorize Access" });
        }
        req.decoded = decoded;
        next();
    })

}

const forbiddenAccess = (req, res, next) => {
    if (req.decoded.email !== req.query.user) {
        return res.status(403).send({ message: "Forbidden Access" });
    }
    next();
}

const run = async () => {
    const Users = client.db('miniSocial').collection('User');
    const AllPost = client.db('miniSocial').collection("AllPost");
    const AllComments = client.db('miniSocial').collection("AllComments");

    try {
        app.post('/user', async (req, res) => {
            const userData = req.body;
            const checkEmail = await Users.find({ email: userData.email }).toArray();
            if (checkEmail.length === 0) {
                const result = await Users.insertOne(userData);
                return res.send(result);
            }
            else {
                return res.send({ acknowledged: true });
            }
        });

        app.post('/jwt', async (req, res) => {
            const email = req.body.email;
            const token = jwt.sign({ email }, ACCESS_TOKEN, { expiresIn: "3h" });
            res.send({ token });
        })

        app.get('/emailStatus', async (req, res) => {
            const user = req.query.user;
            const result = await Users.findOne({ email: user });

            if (result !== null) {
                if (!result?.emailStatus) {
                    const filter = { email: user };
                    const updateDoc = {
                        $set: {
                            emailStatus: true
                        }
                    };
                    const option = { upsert: true };
                    const updateResult = await Users.updateOne(filter, updateDoc, option);
                }
            }

            res.send({ emailStatus: result?.emailStatus });
        });

        app.post('/post', verifyJWT, forbiddenAccess, async (req, res) => {
            let result = await AllPost.insertOne(req.body)
            res.send(result);
        });

        app.get('/allPost', verifyJWT, forbiddenAccess, async (req, res) => {
            let result = await AllPost.find({}).toArray();
            result.forEach(element => {
                let tempReaction = [...element.reactions]
                const tempPerson = tempReaction.filter(data => data.email === req.decoded.email);
                if (tempPerson.length !== 0) {
                    element.personReaction = tempPerson[0].reaction
                }
            })
            res.send(result);
        });

        app.patch('/postReaction', verifyJWT, forbiddenAccess, async (req, res) => {
            const postData = req.body;
            let getPost = await AllPost.findOne({ _id: new ObjectId(postData._id) });
            let tempReactions = [...getPost.reactions];
            console.log(tempReactions);
            if (tempReactions.length === 0) {
                const filter = { _id: new ObjectId(postData._id) }
                const updateDoc = {
                    $set: {
                        reactions: [{ email: req.decoded.email, reaction: postData.personReaction }]
                    }
                }
                const option = { upsert: true };
                const result = await AllPost.updateOne(filter, updateDoc, option);
                return res.send(result)
            }
            else {

                let tempPerson = tempReactions.filter((data) => data.email === req.decoded.email);
                if (tempPerson.length === 0) {
                    tempPerson.push({ email: req.decoded.email, reaction: postData.personReaction })
                }
                else {
                    tempPerson.email = req.decoded.email;
                    tempPerson.reaction = postData.personReaction;
                }
                let restData = tempReactions.filter(data => data.email !== req.decoded.email);
                const filter = { _id: new ObjectId(postData._id) };
                const updateDoc = {
                    $set: {
                        reactions: [...tempPerson, ...restData]
                    }
                }
                const option = { upsert: true };
                const result = await AllPost.updateOne(filter, updateDoc, option);
                console.log(result);
                return res.send(result);
            }
        })

        app.patch('/removePostReaction', verifyJWT, forbiddenAccess, async (req, res) => {
            const postData = req.body;
            const getPost = await AllPost.findOne({ _id: new ObjectId(postData._id) });
            if (getPost) {
                let tempReaction = [...getPost.reactions];
                let storeRestReaction = tempReaction.filter(data => data.email !== req.decoded.email)
                const filter = { _id: new ObjectId(postData._id) };
                const updateDoc = {
                    $set: {
                        reactions: [...storeRestReaction]
                    }
                };
                const option = { upsert: true };
                const result = await AllPost.updateOne(filter, updateDoc, option);
                return res.send(result);
            }
        });

        app.delete('/postDelete', verifyJWT, forbiddenAccess, async (req, res) => {
            const id = req.body.post_id;
            const deleteComment = await AllComments.deleteOne({ postId: id });
            const deletePost = await AllPost.deleteOne({ _id: new ObjectId(id) })
            res.send(deletePost);
        })

        app.patch('/updatePost', verifyJWT, forbiddenAccess, async (req, res) => {
            const filter = { _id: new ObjectId(req.body.postId) };
            const updatedDoc = {
                $set: {
                    postCaption: req.body.postCaption,
                    images: [...req.body.images]
                }
            };
            const option = { upsert: true };
            const result = await AllPost.updateOne(filter, updatedDoc, option);
            res.send(result);
        })

        app.post('/getPostDetails', verifyJWT, forbiddenAccess, async (req, res) => {
            const postId = req.body.postId;
            let getAllComments = await AllComments.find({ postId: postId }).toArray();
            let getPost = await AllPost.findOne({ _id: new ObjectId(postId) });
            if (getAllComments.length !== 0) {
                getAllComments.forEach(element => {
                    if (element.reactions.length !== 0) {
                        const findReaction = element.reactions.filter(data => data.email === req.decoded.email)
                        if (findReaction.length !== 0) {
                            element.personReaction = findReaction[0].reaction
                        }
                    }
                    if(element.replies.length!==0){
                        element.replies.forEach(element2=>{
                            if(element2.reactions.length!==0){
                                let findReaction = element2.reactions.filter(data=>data.email===req.decoded.email);
                                if(findReaction.length!==0){
                                    element2.personReaction= findReaction[0].reaction
                                }
                            }
                        })
                    }
                })
            }
            getPost.allComments = [...getAllComments];
            if (getPost.reactions.length !== 0) {
                const getPersonReaction = getPost.reactions.filter((data) => data.email === req.decoded.email);
                if (getPersonReaction.length !== 0) {
                    getPost.personReaction = getPersonReaction[0].reaction
                }
            }

            //Incomplete Coding;
            res.send(getPost);
        })

        app.post('/commentPost', verifyJWT, forbiddenAccess, async (req, res) => {
            const result = await AllComments.insertOne(req.body);
            res.send(result);
        })

        app.put('/setCommentEmoji', verifyJWT, forbiddenAccess, async (req, res) => {
            const commentId = req.body.commentId;
            let allReactions = [...req.body.commentReactions]
            if (allReactions.length === 0) {
                allReactions.push({ email: req.decoded.email, reaction: req.body.reaction })
            }
            else {
                const RestReaction = allReactions.filter((data) => data.email !== req.body.email)
                const customReaction = [{  email: req.decoded.email, reaction: req.body.reaction }]
                allReactions = [...RestReaction, ...customReaction];
            }
            const filter = { _id: new ObjectId(commentId) };
            const updatedDoc = {
                $set: {
                    reactions: [...allReactions]
                }
            };
            const option = { upsert: true };
            const result = await AllComments.updateOne(filter, updatedDoc, option);
            res.send(result);

        })

        app.put('/removeCommentReaction', verifyJWT, forbiddenAccess, async (req, res) => {
            const restReaction = req.body.commentReactions.filter((data) => data.email !== req.decoded.email);
            const filter = { _id: new ObjectId(req.body.commentId) };
            const updatedDoc = {
                $set: {
                    reactions: [...restReaction]
                }
            }
            const option = { upsert: true };
            const result = await AllComments.updateOne(filter, updatedDoc, option);
            res.send(result);

        });

        app.put('/setReply', verifyJWT, forbiddenAccess, async (req, res) => {
            console.log(req.body);
            let getComment = await AllComments.findOne({ _id: new ObjectId(req.body.commentId) });
            getComment.replies.push({
                _id: new ObjectId(),
                replyMessage: req.body.replyValue,
                replyEmail: req.body.replyEmail,
                time: req.body.time,
                reactions: [...req.body.reactions],
                replyName: req.body.replyName
            });
            const filter = { _id: new ObjectId(req.body.commentId) };
            const updatedDoc = {
                $set: {
                    replies: [...getComment.replies]
                }
            };
            const option = { upsert: true };
            const result = await AllComments.updateOne(filter, updatedDoc, option);
            res.send(result);

        });

        app.put('/setReplyEmoji', verifyJWT, forbiddenAccess, async (req, res) => {
            console.log(req.body);
            let fullComment = await AllComments.findOne({ _id: new ObjectId(req.body.commentId) });
            let restReplies = fullComment.replies.filter(data => data._id.toString() !== req.body.replyId);
            let specificReply = fullComment.replies.filter(data => data._id.toString() === req.body.replyId);
            if (specificReply[0].reactions.length === 0) {
                specificReply[0].reactions.push({
                    email: req.decoded.email,
                    reaction: req.body.reaction
                })
            }
            else{
                // specificReply[0].reactions.email = req.body.replyEmail;
                // specificReply[0].reactions.reaction= req.body.reaction;
                let restReaction = specificReply[0].reactions.filter(data=>data.email!== req.decoded.email)
                const customReaction= [{email: req.decoded.email, reaction: req.body.reaction}]
                specificReply[0].reactions=[...restReaction, ...customReaction]
            }
            fullComment.replies= [...restReplies, ...specificReply];
            const filter = {_id: new ObjectId(req.body.commentId)};
            const updatedDoc= {
                $set: {
                    ...fullComment
                }
            };
            const option = {upsert: true};
            const result = await AllComments.updateOne(filter, updatedDoc, option);
            res.send(result);

        })

        app.put('/removeReplyEmoji', verifyJWT, forbiddenAccess, async(req, res)=>{
            let fullComment = await AllComments.findOne({_id: new ObjectId(req.body.commentId)});
            let restReplies = fullComment.replies.filter(data => data._id.toString() !== req.body.replyId);
            let specificReply = fullComment.replies.filter(data => data._id.toString() === req.body.replyId);
            let restReactions= specificReply[0].reactions.filter(data=>data.email !== req.decoded.email);
            specificReply[0].reactions=[...restReactions];
            fullComment.replies= [...restReplies, ...specificReply];
            const filter = {_id: new ObjectId(req.body.commentId)};
            const updatedDoc= {
                $set: {
                    ...fullComment
                }
            };
            const option = {upsert: true};
            const result = await AllComments.updateOne(filter, updatedDoc, option);
            res.send(result);
        })
        
        app.delete('/deleteComment', verifyJWT, forbiddenAccess, async(req, res)=>{
            const result = await AllComments.deleteOne({_id: new ObjectId(req.body.commentId)})
            res.send(result);
        })

        app.put('/deleteReply', verifyJWT, forbiddenAccess, async(req, res)=>{
            let fullComment= await AllComments.findOne({_id: new ObjectId(req.body.commentId)});
            let restReplies= fullComment.replies.filter(data=>data._id.toString()!== req.body.replyId);
            fullComment.replies= [...restReplies];
            const filter = {_id: new ObjectId(req.body.commentId)};
            const updatedDoc= {
                $set: {
                    ...fullComment
                }
            }
            const option = {upsert: true};
            const result = await AllComments.updateOne(filter, updatedDoc, option);
            res.send(result);
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