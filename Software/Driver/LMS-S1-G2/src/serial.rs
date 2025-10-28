use crate::error::{DriverError, Result};
use crate::models::{Command, Slave, SlaveState, Stats};
use serialport::{SerialPort, SerialPortType};
use std::io::{BufRead, BufReader, Write};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub struct ConnectionConfig {
    pub baud_rate: u32,
    pub timeout: Duration,
}

impl Default for ConnectionConfig {
    fn default() -> Self {
        Self {
            baud_rate: 115200,
            timeout: Duration::from_secs(2),
        }
    }
}

pub struct MasterConnection {
    port: Arc<Mutex<Option<Box<dyn SerialPort>>>>,
    config: ConnectionConfig,
}

impl MasterConnection {
    pub fn new(config: ConnectionConfig) -> Self {
        Self {
            port: Arc::new(Mutex::new(None)),
            config,
        }
    }

    pub fn list_ports() -> Result<Vec<String>> {
        let ports = serialport::available_ports()?;
        
        Ok(ports
            .into_iter()
            .filter_map(|p| {
                if let SerialPortType::UsbPort(_) = p.port_type {
                    Some(p.port_name)
                } else {
                    None
                }
            })
            .collect())
    }

    pub fn connect(&self, port_name: &str) -> Result<()> {
        let port = serialport::new(port_name, self.config.baud_rate)
            .timeout(self.config.timeout)
            .open()?;

        let mut port_lock = self.port.lock().unwrap();
        *port_lock = Some(port);
        
        std::thread::sleep(Duration::from_millis(2000));
        
        Ok(())
    }

    pub fn disconnect(&self) {
        let mut port_lock = self.port.lock().unwrap();
        *port_lock = None;
    }

    pub fn is_connected(&self) -> bool {
        self.port.lock().unwrap().is_some()
    }

    pub fn send_command(&self, command: Command) -> Result<Vec<String>> {
        let mut port_lock = self.port.lock().unwrap();
        let port = port_lock.as_mut().ok_or(DriverError::NotConnected)?;

        let cmd_str = format!("{}\n", command.to_string());
        port.write_all(cmd_str.as_bytes())?;
        port.flush()?;

        std::thread::sleep(Duration::from_millis(100));

        let mut reader = BufReader::new(port.try_clone()?);
        let mut responses = Vec::new();
        let mut line = String::new();

        let start = std::time::Instant::now();
        while start.elapsed() < Duration::from_millis(500) {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        responses.push(trimmed.to_string());
                    }
                }
                Err(_) => break,
            }
        }

        Ok(responses)
    }

    pub fn list_slaves(&self) -> Result<Vec<Slave>> {
        let responses = self.send_command(Command::List)?;
        Self::parse_slave_list(&responses)
    }

    pub fn list_paired_slaves(&self) -> Result<Vec<Slave>> {
        let responses = self.send_command(Command::Paired)?;
        Self::parse_slave_list(&responses)
    }

    pub fn pair_slave(&self, id: u8) -> Result<()> {
        let responses = self.send_command(Command::Pair(id))?;
        
        for line in responses {
            if line.starts_with("ERROR") {
                return Err(DriverError::ParseError(line));
            }
            if line.starts_with("PAIRED") {
                return Ok(());
            }
        }
        
        Err(DriverError::InvalidResponse)
    }

    pub fn unpair_slave(&self, id: u8) -> Result<()> {
        let responses = self.send_command(Command::Unpair(id))?;
        
        for line in responses {
            if line.starts_with("ERROR") {
                return Err(DriverError::ParseError(line));
            }
            if line.starts_with("UNPAIRED") {
                return Ok(());
            }
        }
        
        Err(DriverError::InvalidResponse)
    }

    pub fn ping_slave(&self, id: u8) -> Result<Duration> {
        let start = std::time::Instant::now();
        let responses = self.send_command(Command::Ping(id))?;
        
        for line in responses {
            if line.contains("PONG") {
                return Ok(start.elapsed());
            }
            if line.starts_with("ERROR") {
                return Err(DriverError::ParseError(line));
            }
        }
        
        Err(DriverError::Timeout)
    }

    pub fn send_to_slave(&self, id: u8, message: &str) -> Result<()> {
        let responses = self.send_command(Command::Send(id, message.to_string()))?;
        
        for line in responses {
            if line.starts_with("ERROR") {
                return Err(DriverError::ParseError(line));
            }
            if line.starts_with("COMMAND sent") {
                return Ok(());
            }
        }
        
        Ok(())
    }

    pub fn broadcast(&self, message: &str) -> Result<()> {
        let responses = self.send_command(Command::Broadcast(message.to_string()))?;
        
        for line in responses {
            if line.starts_with("ERROR") {
                return Err(DriverError::ParseError(line));
            }
            if line.starts_with("BROADCAST sent") {
                return Ok(());
            }
        }
        
        Ok(())
    }

    pub fn get_stats(&self) -> Result<Stats> {
        let responses = self.send_command(Command::Stats)?;
        
        for line in responses {
            if line.starts_with("STATS:") {
                return Self::parse_stats(&line);
            }
        }
        
        Err(DriverError::InvalidResponse)
    }

    fn parse_slave_list(lines: &[String]) -> Result<Vec<Slave>> {
        let mut slaves = Vec::new();

        for line in lines {
            if line.starts_with("ID ") {
                if let Some(slave) = Self::parse_slave_line(line) {
                    slaves.push(slave);
                }
            }
        }

        Ok(slaves)
    }

    fn parse_slave_line(line: &str) -> Option<Slave> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 6 {
            return None;
        }

        let id = parts[1].trim_end_matches(':').parse::<u8>().ok()?;
        
        let mac_str = parts[2];
        let mac_bytes: Vec<u8> = mac_str
            .split(':')
            .filter_map(|s| u8::from_str_radix(s, 16).ok())
            .collect();
        
        if mac_bytes.len() != 6 {
            return None;
        }
        
        let mut mac = [0u8; 6];
        mac.copy_from_slice(&mac_bytes);

        let rssi = if parts.len() > 4 && parts[3] == "RSSI" {
            parts[4].parse::<i32>().unwrap_or(0)
        } else {
            0
        };

        let state_str = parts.last()?;
        let state = match *state_str {
            "UNPAIRED" => SlaveState::Discovered,
            "PAIRED" => SlaveState::Paired,
            "LOST" => SlaveState::Lost,
            _ => SlaveState::Discovered,
        };

        let paired = state == SlaveState::Paired;

        Some(Slave {
            id,
            mac,
            rssi,
            state,
            last_seen_ms: 0,
            paired,
        })
    }

    fn parse_stats(line: &str) -> Result<Stats> {
        let mut paired = 0u8;
        let mut discovered = 0u8;
        let mut sent = 0u32;
        let mut received = 0u32;
        let mut lost = 0u32;

        for part in line.split_whitespace() {
            if let Some(val) = part.strip_prefix("Paired=") {
                paired = val.parse().unwrap_or(0);
            } else if let Some(val) = part.strip_prefix("Discovered=") {
                discovered = val.parse().unwrap_or(0);
            } else if let Some(val) = part.strip_prefix("Sent=") {
                sent = val.parse().unwrap_or(0);
            } else if let Some(val) = part.strip_prefix("Recv=") {
                received = val.parse().unwrap_or(0);
            } else if let Some(val) = part.strip_prefix("Lost=") {
                lost = val.parse().unwrap_or(0);
            }
        }

        Ok(Stats {
            paired,
            discovered,
            sent,
            received,
            lost,
        })
    }
}

