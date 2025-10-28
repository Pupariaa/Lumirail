use serde::{Deserialize, Serialize};

#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SlaveState {
    Unpaired = 0,
    Discovered = 1,
    Paired = 2,
    Lost = 3,
}

#[repr(C)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Slave {
    pub id: u8,
    pub mac: [u8; 6],
    pub rssi: i32,
    pub state: SlaveState,
    pub last_seen_ms: u64,
    pub paired: bool,
}

impl Slave {
    pub fn mac_string(&self) -> String {
        format!(
            "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
            self.mac[0], self.mac[1], self.mac[2],
            self.mac[3], self.mac[4], self.mac[5]
        )
    }
}

#[derive(Debug, Clone)]
pub enum Command {
    List,
    Paired,
    Pair(u8),
    Unpair(u8),
    Ping(u8),
    Send(u8, String),
    Broadcast(String),
    Stats,
}

impl Command {
    pub fn to_string(&self) -> String {
        match self {
            Command::List => "list".to_string(),
            Command::Paired => "paired".to_string(),
            Command::Pair(id) => format!("pair {}", id),
            Command::Unpair(id) => format!("unpair {}", id),
            Command::Ping(id) => format!("ping {}", id),
            Command::Send(id, msg) => format!("send {} {}", id, msg),
            Command::Broadcast(msg) => format!("broadcast {}", msg),
            Command::Stats => "stats".to_string(),
        }
    }
}

#[repr(C)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stats {
    pub paired: u8,
    pub discovered: u8,
    pub sent: u32,
    pub received: u32,
    pub lost: u32,
}

