const express = require('express');
const router = express.Router();
const developerController = require('../controllers/developerController');
const onboardingController = require('../controllers/onboardingController');
const developerGuard = require('../middlewares/developerGuard');

router.get('/login', developerController.loginPage);
router.post('/login', developerController.login);
router.post('/logout', developerGuard, developerController.logout);

router.get('/dashboard', developerGuard, developerController.dashboardPage);
router.get('/tenants', developerGuard, developerController.getTenants);
router.post('/tenants/toggle', developerGuard, developerController.toggleTenantStatus);

router.get('/api/tenants', developerGuard, onboardingController.listarTenants);
router.get('/api/tenants/:id', developerGuard, onboardingController.obtenerTenant);
router.post('/api/tenants/create', developerGuard, onboardingController.crearTenant);

module.exports = router;
