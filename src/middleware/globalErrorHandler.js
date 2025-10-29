// global error handler


function globalErrorHandler(err, req, res, next) {
  const status = err.status || 500;

  res.status(err.status || 500).json({
  success: false,
  message: err.message || "Internal Server Error",
  ...(err.errors && { errors: err.errors }),
  ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
});

}



export default globalErrorHandler;