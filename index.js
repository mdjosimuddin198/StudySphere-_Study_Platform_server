require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const validToken = (req, res, next) => {
  const token = req?.cookies?.AccessToken;
  // console.log("i am inside in logger mideleware", token);
  if (!token) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized Access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = process.env.SECRET_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const database = client.db("StudySphereDB");
    const usersCollection = database.collection("user");
    const tutorCollection = database.collection("tutors");

    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        // ✅ Update last login time
        const updated = await usersCollection.updateOne(
          { email },
          { $set: { last_log_in: new Date().toISOString() } }
        );

        return res.status(200).send({
          message: "User already exists, last login updated.",
          inserted: false,
          updatedCount: updated.modifiedCount,
        });
      }
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    // get approvedTutors
    app.get("/tutors/approved", async (req, res) => {
      const approvedTutors = await tutorCollection
        .find({ status: "approved" })
        .toArray();
      res.send(approvedTutors);
    });

    // GET /tutors/pending

    app.get("/tutors/pending", async (req, res) => {
      try {
        const pendingTutors = await tutorCollection
          .find({ status: "pending" })
          .toArray();
        res.status(200).send(pendingTutors);
      } catch (error) {
        console.error("Error fetching pending tutors:", error);
        res.status(500).send({ message: "Failed to fetch pending tutors" });
      }
    });

    // accept or reajct tutor
    // PATCH: Update tutor status (approve/reject)
    app.patch("/tutors/status/:id", async (req, res) => {
      const { id } = req.params;
      const { status, email } = req.body;

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status },
      };

      try {
        const result = await tutorCollection.updateOne(query, updateDoc);

        if (status === "approved") {
          const userQuery = { email };
          const userUpdateDoc = {
            $set: { role: "tutor" },
          };
          const roleResult = await usersCollection.updateOne(
            userQuery,
            userUpdateDoc
          );
          console.log("Role updated:", roleResult.modifiedCount);
        }

        res.send(result);
      } catch (error) {
        console.error("Error updating tutor:", error);
        res.status(500).send({ message: "Failed to update tutor status" });
      }
    });

    app.post("/tutors", async (req, res) => {
      const tutorInfo = req.body;
      const result = await tutorCollection.insertOne(tutorInfo);
      res.send(result);
    });

    // token
    app.post("/jwt_token", async (req, res) => {
      const { userEmail } = req.body;
      const userInfo = userEmail;
      const token = jwt.sign({ userInfo }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      res.cookie("AccessToken", token, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
      });

      res.send({ message: "successfull" });
    });

    app.post("/api/logout", (req, res) => {
      res.clearCookie("AccessToken", {
        httpOnly: true,
        secure: false, // যদি তোমার অ্যাপ production এ থাকে তাহলে true করো
        sameSite: "lax",
        path: "/",
      });
      res.json({ message: "Logout successful." });
    });
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running ..!");
});

app.listen(port, () => {
  console.log(`StudySphere app listening on port ${port}`);
});
