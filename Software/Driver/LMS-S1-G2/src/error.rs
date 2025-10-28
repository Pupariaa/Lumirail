use thiserror::Error;

#[derive(Error, Debug)]
pub enum DriverError {
    #[error("Serial port error: {0}")]
    SerialPort(#[from] serialport::Error),
    
    #[error("Connection not established")]
    NotConnected,
    
    #[error("Invalid response from device")]
    InvalidResponse,
    
    #[error("Timeout waiting for response")]
    Timeout,
    
    #[error("Slave not found: {0}")]
    SlaveNotFound(u8),
    
    #[error("Invalid slave ID: {0}")]
    InvalidSlaveId(u8),
    
    #[error("Parse error: {0}")]
    ParseError(String),
}

pub type Result<T> = std::result::Result<T, DriverError>;

