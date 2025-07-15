require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
const app = express();
// https://simple-firebase-authenti-d1f36.firebaseapp.com
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const stripe = require("stripe")(process.env.PAYMENT_SECRET);

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
    const studySessionCollection = database.collection("studySession");
    const bookedSessionsCollectin = database.collection("bookedSessions");
    const reviewsCollection = database.collection("reviews");
    const paymentsCollection = database.collection("payments");
    const materialsCollection = database.collection("material");
    const notesCollection = database.collection("note");

    app.post("/notes", async (req, res) => {
      const note = req.body;
      const result = await notesCollection.insertOne(note);
      res.send(result);
    });

    app.get("/notes", async (req, res) => {
      const email = req.query.email;
      const notes = await notesCollection.find({ email }).toArray();
      res.send(notes);
    });

    app.put("/notes/:id", async (req, res) => {
      const id = req.params.id;
      const updated = req.body;
      const result = await notesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updated }
      );
      res.send(result);
    });

    app.delete("/notes/:id", async (req, res) => {
      const id = req.params.id;
      const result = await notesCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.post("/materials", async (req, res) => {
      const material = req.body;
      const result = await materialsCollection.insertOne(material);
      res.send(result);
    });

    app.get("/materials", async (req, res) => {
      const sessionId = req.query.sessionId;
      const materials = await materialsCollection.find({ sessionId }).toArray();
      res.send(materials);
    });

    app.post("/payments", async (req, res) => {
      try {
        const { id, email, amount, paymentMethod, transactionId } = req.body;

        // Optional: validate input
        if (!id || !email) {
          return res.status(400).send({ message: "Missing required fields" });
        }

        // ✅ Update bookedSessions status to "paid"
        const updateBookedSession = await bookedSessionsCollectin.updateOne(
          { sessionId: id, studentEmail: email },
          { $set: { paid_status: "paid" } }
        );

        if (updateBookedSession.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "Booking not found or already paid" });
        }

        // ✅ Save payment record
        const paymentDoc = {
          id,
          email,
          amount,
          paymentMethod,
          transactionId,
          paid_at: new Date(),
          paid_at_string: new Date().toISOString(),
        };

        const paymentResult = await paymentsCollection.insertOne(paymentDoc);

        res.status(201).send({
          message: "Payment recorded and session marked as paid",
          insertedId: paymentResult.insertedId,
        });
      } catch (error) {
        console.error("Payment error:", error);
        res.status(500).send({ message: "Failed to process payment" });
      }
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body; // Amount should be in cents

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.post("/bookedSessions", async (req, res) => {
      try {
        const { studentEmail, sessionId, tutorEmail, sessionTitle, bookedAt } =
          req.body;

        if (!studentEmail || !sessionId) {
          return res
            .status(400)
            .send({ message: "studentEmail and sessionId are required" });
        }

        const existingBooking = await bookedSessionsCollectin.findOne({
          sessionId,
          studentEmail,
        });

        if (existingBooking) {
          return res
            .status(400)
            .send({ message: "You have already booked this session." });
        }

        const bookedData = {
          studentEmail,
          sessionId,
          tutorEmail,
          sessionTitle,
          bookedAt,
        };

        const result = await bookedSessionsCollectin.insertOne(bookedData);
        res.status(201).send(result);
      } catch (error) {
        console.error("Booking error:", error);
        res.status(500).send({ message: "Failed to book session" });
      }
    });

    app.get("/bookedSessions", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).send({ error: "Email is required" });
        }

        const query = { studentEmail: email }; // ধরে নিচ্ছি studentEmail ফিল্ডে ইউজার ইমেইল থাকে
        const bookedSessions = await bookedSessionsCollectin
          .find(query)
          .toArray();

        res.send(bookedSessions);
      } catch (error) {
        console.error("Failed to fetch booked sessions:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.post("/reviews", async (req, res) => {
      const reviewsData = req.body;
      const result = await reviewsCollection.insertOne(reviewsData);
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const sessionId = req.query.sessionId;
      const result = await reviewsCollection
        .find({ sessionId: sessionId })
        .toArray();
      res.send(result);
    });

    app.post("/study_session", async (req, res) => {
      const studySessionData = req.body;
      const result = await studySessionCollection.insertOne(studySessionData);
      res.send(result);
    });

    app.get("/study_session", async (req, res) => {
      try {
        const { status, limit } = req.query;

        let query = {};
        if (status === "pending") {
          query.status = "pending";
        } else if (status === "approved") {
          query.status = "approved";
        }

        const limitValue = parseInt(limit) || 0; // limit না থাকলে সব দেখাবে

        const sessions = await studySessionCollection
          .find(query)
          .limit(limitValue)
          .toArray();

        res.send(sessions);
      } catch (error) {
        console.error("Failed to fetch study sessions:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.get("/study_session/:id", async (req, res) => {
      const { id } = req.params;
      const quary = { _id: new ObjectId(id) };
      const result = await studySessionCollection.findOne(quary);
      res.send(result);
    });

    app.delete("/study_session/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const result = await studySessionCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 1) {
          res.send({ success: true, message: "Session deleted successfully" });
        } else {
          res
            .status(404)
            .send({ success: false, message: "Session not found" });
        }
      } catch (error) {
        console.error("Delete error:", error);
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    app.patch("/study_session/:id/status", async (req, res) => {
      const { id } = req.params;
      const { status, registrationFee } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const updateFields = { status };
      if (registrationFee !== undefined) {
        updateFields.registrationFee = Number(registrationFee);
      }

      try {
        const result = await studySessionCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateFields }
        );

        if (result.modifiedCount > 0) {
          res.send({ message: "Status and fee updated" });
        } else {
          res.status(404).send({ message: "Not found or already updated" });
        }
      } catch (error) {
        res.status(500).send({ message: "Server error", error });
      }
    });

    app.patch("/study_session/resubmit/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await studySessionCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "pending" } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to resubmit session." });
      }
    });

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded?.userInfo;

      if (!email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const user = await usersCollection.findOne({ email });

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    // get user role
    app.get("/users/role/:email", validToken, async (req, res) => {
      const email = req.params.email;

      try {
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ role: user.role || "user" }); // default role: user
      } catch (error) {
        console.error("Error fetching role:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // get all users
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

    app.get("/users", validToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // search user by email or name
    app.get("/users/search", validToken, verifyAdmin, async (req, res) => {
      const { email } = req.query;
      if (!email) {
        return res.status(400).send({ message: "Email query is required" });
      }

      const regex = new RegExp(email, "i"); // case insensitive
      const users = await usersCollection
        .find({ email: { $regex: regex } })
        // .project({ email: 1, createdAt: 1, role: 1 }) // only necessary fields
        .limit(10) // limit result count
        .toArray();

      res.send(users);
    });

    // Update user role (make admin or remove admin)
    app.patch("/users/role/:id", validToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { role } = req.body; // expected: 'admin' or 'student' (or 'mentor')

      if (!role || !["admin", "user", "tutor"].includes(role)) {
        return res.status(400).send({ message: "Invalid role" });
      }

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid user id" });
      }

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );

      if (result.modifiedCount > 0) {
        res.send({ message: `User role updated to ${role}` });
      } else {
        res.status(404).send({ message: "User not found or role unchanged" });
      }
    });

    // get approvedTutors
    app.get("/tutors/approved", async (req, res) => {
      const approvedTutors = await tutorCollection
        .find({ status: "approved" })
        .toArray();
      res.send(approvedTutors);
    });

    // GET /tutors/pending

    app.get("/tutors/pending", validToken, verifyAdmin, async (req, res) => {
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
    app.patch("/tutors/status/:id", validToken, async (req, res) => {
      const { id } = req.params;
      const { status, email } = req.body;

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status },
      };

      try {
        const result = await tutorCollection.updateOne(query, updateDoc);

        const userQuery = { email };
        let roleUpdateDoc;

        if (status === "approved") {
          roleUpdateDoc = { $set: { role: "tutor" } };
        } else if (status === "rejected") {
          roleUpdateDoc = { $set: { role: "user" } }; // রিজেক্ট হলে ইউজারে রোল ফেরত দাও
        }

        if (roleUpdateDoc) {
          const roleResult = await usersCollection.updateOne(
            userQuery,
            roleUpdateDoc
          );
          // console.log("Role updated:", roleResult.modifiedCount);
        }

        res.send(result);
      } catch (error) {
        console.error("Error updating tutor:", error);
        res.status(500).send({ message: "Failed to update tutor status" });
      }
    });

    // post a tutor
    app.post("/tutors", validToken, async (req, res) => {
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
        secure: true,
        sameSite: "none",
      });

      res.send({ message: "successfull" });
    });

    // logout user and clear cookie
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
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
