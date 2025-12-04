const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5000;

// ======== MIDDLEWARES ========
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// Static folder for uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");

// ======== RAZORPAY CONFIG ========
const razorpay = new Razorpay({
  key_id: "rzp_test_Rn9O67EtOVcvGF",
  key_secret: "gN7GCfIfiNlD2v1pjRgNUHRL",
});

// ======== IN-MEMORY DATABASE ========
let carousel = {};
let categories = {};
let products = {};
let carts = {};
let orders = {};
let users = {};

// Utility
function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 5);
}

// Save Base64 image to /uploads
function saveBase64Image(base64) {
  try {
    const matches = base64.match(/^data:image\/(\w+);base64,/);
    const ext = matches ? matches[1] : 'png';
    const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 8)}.${ext}`;
    const filePath = `uploads/${fileName}`;
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(filePath, base64Data, "base64");
    return filePath;
  } catch (err) {
    console.error("Error saving image:", err);
    return null;
  }
}

// ======================================================
//                      AUTH API
// ======================================================
app.post("/api/auth/signup", (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.json({ success: false, message: "All fields are required" });
  }

  // Check if user already exists
  const existingUser = Object.values(users).find(u => u.email === email);
  if (existingUser) {
    return res.json({ success: false, message: "Email already registered" });
  }

  const userId = generateId();
  users[userId] = {
    userId,
    name,
    email,
    password, // In production, hash this!
    createdAt: new Date().toISOString()
  };

  res.json({ success: true, message: "Account created successfully" });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({ success: false, message: "Email and password required" });
  }

  const user = Object.values(users).find(u => u.email === email && u.password === password);

  if (!user) {
    return res.json({ success: false, message: "Invalid email or password" });
  }

  res.json({
    success: true,
    user: {
      userId: user.userId,
      name: user.name,
      email: user.email
    }
  });
});

// ======================================================
//                      CAROUSEL API
// ======================================================
app.get("/api/carousel", (req, res) => {
  res.json({ success: true, slides: Object.values(carousel) });
});

app.post("/api/carousel/add", (req, res) => {
  let { image, title, subtitle, buttonText, buttonLink } = req.body;

  if (!image) return res.json({ success: false, message: "Image required" });

  if (image.startsWith("data:image")) {
    image = saveBase64Image(image);
  }

  const id = generateId();
  carousel[id] = { id, image, title, subtitle, buttonText, buttonLink };
  res.json({ success: true, slide: carousel[id] });
});

app.post("/api/carousel/update", (req, res) => {
  const { id } = req.body;
  if (!carousel[id]) return res.json({ success: false, message: "Slide not found" });

  let { image } = req.body;

  if (image && image.startsWith("data:image")) {
    image = saveBase64Image(image);
  }

  carousel[id] = { ...carousel[id], ...req.body, image: image || carousel[id].image };
  res.json({ success: true, slide: carousel[id] });
});

app.delete("/api/carousel/delete/:id", (req, res) => {
  delete carousel[req.params.id];
  res.json({ success: true });
});

// ======================================================
//                      CATEGORIES API
// ======================================================
app.get("/api/categories", (req, res) => {
  res.json({ success: true, categories: Object.values(categories) });
});

app.get("/api/categories/:id", (req, res) => {
  const cat = categories[req.params.id];
  if (!cat) return res.json({ success: false, message: "Category not found" });
  res.json({ success: true, category: cat });
});

app.post("/api/categories/add", (req, res) => {
  let { name, description, image } = req.body;

  if (!name || !image)
    return res.json({ success: false, message: "Name & Image required" });

  if (image.startsWith("data:image")) {
    image = saveBase64Image(image);
  }

  const id = generateId();
  categories[id] = { id, name, description, image };
  res.json({ success: true, category: categories[id] });
});

app.post("/api/categories/update", (req, res) => {
  const { id } = req.body;
  if (!categories[id]) return res.json({ success: false, message: "Category not found" });

  let { image } = req.body;

  if (image && image.startsWith("data:image")) {
    image = saveBase64Image(image);
  }

  categories[id] = { ...categories[id], ...req.body, image: image || categories[id].image };
  res.json({ success: true, category: categories[id] });
});

app.delete("/api/categories/delete/:id", (req, res) => {
  delete categories[req.params.id];
  res.json({ success: true });
});

// ======================================================
//                      PRODUCTS API
// ======================================================
app.get("/api/products", (req, res) => {
  res.json({ success: true, products: Object.values(products) });
});

// Get products by category name
app.get("/api/products/by-category/:catName", (req, res) => {
  const cat = decodeURIComponent(req.params.catName).toLowerCase();
  const list = Object.values(products).filter(
    (p) => (p.category || "").toLowerCase() === cat
  );
  res.json({ success: true, products: list });
});

// Get single product by ID
app.get("/api/products/:id", (req, res) => {
  const product = products[req.params.id];
  if (!product) {
    return res.json({ success: false, message: "Product not found" });
  }
  res.json({ success: true, product });
});

app.post("/api/products/add", (req, res) => {
  let { name, price, description, category, image, images, rating, badge, featured, isNew, isFeatured } = req.body;

  if (!name || !price || !category || !image)
    return res.json({ success: false, message: "Missing required fields" });

  // Handle main image
  if (image.startsWith("data:image")) {
    image = saveBase64Image(image);
  }

  // Handle multiple images
  if (Array.isArray(images)) {
    images = images.map((img) =>
      img.startsWith("data:image") ? saveBase64Image(img) : img
    );
  } else {
    images = [image];
  }

  const id = generateId();
  products[id] = {
    id,
    name,
    price: parseFloat(price),
    description,
    category,
    image,
    images,
    rating: parseFloat(rating) || 4.0,
    badge: badge || false,
    featured: featured || isFeatured || false,
    isNew: isNew || badge || false,
    isFeatured: isFeatured || featured || false,
    createdAt: new Date().toISOString()
  };

  res.json({ success: true, product: products[id] });
});

app.post("/api/products/update", (req, res) => {
  const { id } = req.body;
  if (!products[id]) return res.json({ success: false, message: "Product not found" });

  let { image, images } = req.body;

  if (image && image.startsWith("data:image")) {
    image = saveBase64Image(image);
  }

  if (Array.isArray(images)) {
    images = images.map((img) =>
      img.startsWith("data:image") ? saveBase64Image(img) : img
    );
  }

  const updatedProduct = {
    ...products[id],
    ...req.body,
    image: image || products[id].image,
    images: images || products[id].images,
    price: req.body.price ? parseFloat(req.body.price) : products[id].price,
    rating: req.body.rating ? parseFloat(req.body.rating) : products[id].rating
  };

  products[id] = updatedProduct;
  res.json({ success: true, product: products[id] });
});

app.delete("/api/products/delete/:id", (req, res) => {
  delete products[req.params.id];
  res.json({ success: true });
});

// ======================================================
//                      CART API
// ======================================================
app.get("/api/cart/:userId", (req, res) => {
  const cart = carts[req.params.userId] || [];
  res.json({ success: true, cart });
});

app.post("/api/cart/add", (req, res) => {
  const { userId, productId, name, price, quantity, image } = req.body;

  if (!userId || !productId) {
    return res.json({ success: false, message: "Missing required fields" });
  }

  if (!carts[userId]) carts[userId] = [];

  const existing = carts[userId].find((i) => i.id === productId);

  if (existing) {
    existing.quantity += quantity || 1;
  } else {
    carts[userId].push({
      id: productId,
      name,
      price: parseFloat(price),
      quantity: quantity || 1,
      image,
    });
  }

  res.json({ success: true, cart: carts[userId] });
});

app.put("/api/cart/update/:userId/:itemId", (req, res) => {
  const { userId, itemId } = req.params;
  const { quantity } = req.body;

  if (!carts[userId]) {
    return res.json({ success: false, message: "Cart not found" });
  }

  const cart = carts[userId];
  const item = cart.find((i) => i.id === itemId);

  if (item) {
    item.quantity = parseInt(quantity);
  }

  res.json({ success: true, cart: carts[userId] });
});

app.delete("/api/cart/delete/:userId/:itemId", (req, res) => {
  const { userId, itemId } = req.params;

  if (!carts[userId]) {
    return res.json({ success: true, cart: [] });
  }

  carts[userId] = carts[userId].filter((i) => i.id !== itemId);
  res.json({ success: true, cart: carts[userId] });
});

app.delete("/api/cart/clear/:userId", (req, res) => {
  const { userId } = req.params;
  carts[userId] = [];
  res.json({ success: true, cart: [] });
});

// ======================================================
//                      PAYMENT API
// ======================================================
app.post("/api/payment/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.json({ success: false, error: "Invalid amount" });
    }

    const razorOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Convert to paise
      currency: "INR",
      receipt: "rcpt_" + generateId(),
    });

    res.json({ success: true, order: razorOrder });
  } catch (err) {
    console.error("Razorpay Error:", err);
    res.json({ success: false, error: err.message });
  }
});

app.post("/api/payment/verify", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const sign = crypto
    .createHmac("sha256", razorpay.key_secret)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (sign !== razorpay_signature) {
    return res.json({ success: false, message: "Payment verification failed" });
  }

  res.json({ success: true, message: "Payment verified successfully" });
});

// ======================================================
//                      ORDER API
// ======================================================
app.post("/api/orders/create", (req, res) => {
  const { userId, fullName, phone, email, address, city, state, pincode, total, paymentId, items } = req.body;

  const orderNumber = "ORD" + Date.now().toString().slice(-8) + Math.random().toString(36).substr(2, 4).toUpperCase();
  const id = generateId();

  // Get cart items if not provided
  let orderItems = items;
  if (!orderItems && userId && carts[userId]) {
    orderItems = carts[userId];
  }

  orders[id] = {
    id,
    orderNumber,
    userId,
    fullName,
    phone,
    email,
    address,
    city,
    state,
    pincode,
    total: parseFloat(total),
    paymentId,
    items: orderItems || [],
    status: "confirmed",
    createdAt: new Date().toISOString()
  };

  // Clear cart after order
  if (userId && carts[userId]) {
    carts[userId] = [];
  }

  res.json({ success: true, order: orders[id] });
});

app.get("/api/orders/:id", (req, res) => {
  // Try to find by id or orderNumber
  let order = orders[req.params.id];

  if (!order) {
    order = Object.values(orders).find(o => o.orderNumber === req.params.id);
  }

  if (!order) {
    return res.json({ success: false, message: "Order not found" });
  }

  res.json({ success: true, order });
});

app.get("/api/orders/user/:userId", (req, res) => {
  const userOrders = Object.values(orders).filter(o => o.userId === req.params.userId);
  res.json({ success: true, orders: userOrders });
});

// ======================================================
//                      SERVER START
// ======================================================
app.listen(PORT, () => {
  console.log(`🚀 AASHVI Server running on http://localhost:${PORT}`);
  console.log(`📁 Uploads directory: ./uploads`);
  console.log(`💳 Razorpay configured`);
});