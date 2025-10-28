pub mod error;
pub mod models;
pub mod serial;
pub mod ffi;

pub use error::{Result, DriverError};
pub use models::{Slave, SlaveState, Command};
pub use serial::{MasterConnection, ConnectionConfig};

