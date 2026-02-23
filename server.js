// server.js
import express from "express";
import nodemailer from "nodemailer";
import crypto from "crypto";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Replace these with your actual PayFast credentials
const PAYFAST_MERCHANT_ID = "YOUR_ID";
const PAYFAST_MERCHANT_KEY = "YOUR_KEY";
const PAYFAST_RETURN_URL = "http://localhost:3000/success";
const PAYFAST_CANCEL_URL = "http://localhost:3000/cancel";
const PAYFAST_NOTIFY_URL = "http://localhost:3000/notify";

// Helper: generate PayFast signature
function generateSignature(data) {
  const ordered = Object.keys(data).sort().reduce((obj, key) => {
    if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
      obj[key] = data[key];
    }
    return obj;
  }, {});

  const queryString = Object.keys(ordered).map(
    key => `${key}=${encodeURIComponent(ordered[key]).replace(/%20/g, "+")}`
  ).join("&");

  return crypto.createHash("md5").update(queryString).digest("hex");
}

// Helper: send order confirmation email
async function sendConfirmationEmail(order) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "your@gmail.com",       // Your Gmail
      pass: "app-password"          // App-specific password
    }
  });

  await transporter.sendMail({
    to: order.email,
    subject: "UMMAH Order Confirmation",
    html: `
      <h2>Thank you for your order</h2>
      <p>Order ID: ${order.id}</p>
      <p>Total: R ${order.total}</p>
      <p>Delivery Address: ${order.address}</p>
      <p>We will process your order once payment is confirmed.</p>
    `
  });
}

// ------------------- ROUTES ------------------- //

// 1️⃣ Create payment
app.post("/create-payment", async (req, res) => {
  const { form, cart } = req.body;
  const DELIVERY_FEE = 60;
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0) + DELIVERY_FEE;
  const orderId = "UMMAH-" + Date.now();

  // Normally: save order in DB with status = "pending"
  // Example:
  // await db.saveOrder({ id: orderId, form, cart, total, status: "pending" });

  const payfastData = {
    merchant_id: PAYFAST_MERCHANT_ID,
    merchant_key: PAYFAST_MERCHANT_KEY,
    return_url: PAYFAST_RETURN_URL,
    cancel_url: PAYFAST_CANCEL_URL,
    notify_url: PAYFAST_NOTIFY_URL,
    name_first: form.name,
    email_address: form.email,
    m_payment_id: orderId,
    amount: total.toFixed(2),
    item_name: "UMMAH Order",
    custom_str1: form.address // Pass delivery address in custom field
  };

  payfastData.signature = generateSignature(payfastData);

  // Build auto-submit HTML form
  let html = `<form method="post" action="https://sandbox.payfast.co.za/eng/process">`;
  for (let k in payfastData) {
    html += `<input type="hidden" name="${k}" value="${payfastData[k]}">`;
  }
  html += `</form><script>document.forms[0].submit()</script>`;

  res.send(html);
});

// 2️⃣ PayFast notification callback
app.post("/notify", async (req, res) => {
  const pfData = req.body;

  // ✅ Important: Verify PayFast signature here!
  // Normally: compute signature again and compare

  const order = {
    id: pfData.m_payment_id,
    email: pfData.email_address,
    total: pfData.amount_gross,
    address: pfData.custom_str1
  };

  console.log("Payment received for order:", order.id);

  // Mark order as PAID in DB
  // Example: await db.updateOrder(order.id, { status: "paid" });

  // Send confirmation email
  try {
    await sendConfirmationEmail(order);
    console.log("Confirmation email sent to", order.email);
  } catch (err) {
    console.error("Error sending email:", err);
  }

  res.send("OK"); // Must respond to PayFast
});

// 3️⃣ Success & cancel pages (simple)
app.get("/success", (req, res) => res.send("Payment Successful! Thank you for your order."));
app.get("/cancel", (req, res) => res.send("Payment Cancelled."));

app.listen(3000, () => console.log("Server running on port 3000"));
