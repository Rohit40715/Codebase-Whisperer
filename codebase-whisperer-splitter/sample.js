// sample.js
class AuthController {
    constructor(userService) {
        this.userService = userService;
    }

    async login(req, res) {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }

        try {
            const session = await this.userService.authenticateUser(email, password);
            return res.status(200).json({ success: true, token: session.token });
        } catch (error) {
            return res.status(401).json({ error: "Invalid credentials." });
        }
    }

    logout(req, res) {
        this.userService.clearSession(req.userId);
        return res.status(200).json({ message: "Successfully logged out." });
    }
}

const formatErrorResponse = (err) => {
    return {
        status: "fail",
        message: err.message || "An unexpected error occurred."
    };
};