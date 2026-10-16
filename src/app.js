const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const { globalLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');
const flashSaleRoutes = require('./routes/flashSaleRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

app.use(helmet({ contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'upgrade-insecure-requests': null } } }));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.static(require('path').join(__dirname, '../public')));
app.use(globalLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

app.use('/api', flashSaleRoutes);
app.use('/api/auth', authRoutes);

app.use((req, res) => res.status(404).json({ success: false, error: 'NOT_FOUND' }));
app.use(errorHandler);

module.exports = app;
