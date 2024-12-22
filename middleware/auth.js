const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    req.flash('error', 'Please log in to access this resource');
    res.redirect('/auth/login');
};

const isNotAuthenticated = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return next();
    }
    res.redirect('/dashboard');
};

module.exports = {
    isAuthenticated,
    isNotAuthenticated
}; 