use crate::models::{Slave, SlaveState, Stats};
use crate::serial::{ConnectionConfig, MasterConnection};
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::sync::Arc;
use std::time::Duration;

#[repr(C)]
pub struct CSlaveInfo {
    pub id: u8,
    pub mac: [u8; 6],
    pub rssi: i32,
    pub state: u8,
    pub paired: u8,
}

#[repr(C)]
pub struct CStats {
    pub paired: u8,
    pub discovered: u8,
    pub sent: u32,
    pub received: u32,
    pub lost: u32,
}

static mut CONNECTION: Option<Arc<MasterConnection>> = None;

#[no_mangle]
pub extern "C" fn lms_s1_g2_init() -> c_int {
    let config = ConnectionConfig::default();
    let conn = Arc::new(MasterConnection::new(config));
    
    unsafe {
        CONNECTION = Some(conn);
    }
    
    0
}

#[no_mangle]
pub extern "C" fn lms_s1_g2_connect(port_name: *const c_char) -> c_int {
    if port_name.is_null() {
        return -1;
    }

    let conn = unsafe {
        match &CONNECTION {
            Some(c) => c.clone(),
            None => return -2,
        }
    };

    let c_str = unsafe { CStr::from_ptr(port_name) };
    let port = match c_str.to_str() {
        Ok(s) => s,
        Err(_) => return -3,
    };

    match conn.connect(port) {
        Ok(_) => 0,
        Err(_) => -4,
    }
}

#[no_mangle]
pub extern "C" fn lms_s1_g2_disconnect() {
    let conn = unsafe {
        match &CONNECTION {
            Some(c) => c.clone(),
            None => return,
        }
    };

    conn.disconnect();
}

#[no_mangle]
pub extern "C" fn lms_s1_g2_is_connected() -> c_int {
    let conn = unsafe {
        match &CONNECTION {
            Some(c) => c.clone(),
            None => return 0,
        }
    };

    if conn.is_connected() { 1 } else { 0 }
}

#[no_mangle]
pub extern "C" fn lms_s1_g2_list_slaves(out_slaves: *mut CSlaveInfo, max_count: usize) -> c_int {
    if out_slaves.is_null() {
        return -1;
    }

    let conn = unsafe {
        match &CONNECTION {
            Some(c) => c.clone(),
            None => return -2,
        }
    };

    let slaves = match conn.list_slaves() {
        Ok(s) => s,
        Err(_) => return -3,
    };

    let count = slaves.len().min(max_count);
    let out_slice = unsafe { std::slice::from_raw_parts_mut(out_slaves, count) };

    for (i, slave) in slaves.iter().take(count).enumerate() {
        out_slice[i] = CSlaveInfo {
            id: slave.id,
            mac: slave.mac,
            rssi: slave.rssi,
            state: slave.state as u8,
            paired: if slave.paired { 1 } else { 0 },
        };
    }

    count as c_int
}

#[no_mangle]
pub extern "C" fn lms_s1_g2_pair_slave(id: u8) -> c_int {
    let conn = unsafe {
        match &CONNECTION {
            Some(c) => c.clone(),
            None => return -1,
        }
    };

    match conn.pair_slave(id) {
        Ok(_) => 0,
        Err(_) => -2,
    }
}

#[no_mangle]
pub extern "C" fn lms_s1_g2_unpair_slave(id: u8) -> c_int {
    let conn = unsafe {
        match &CONNECTION {
            Some(c) => c.clone(),
            None => return -1,
        }
    };

    match conn.unpair_slave(id) {
        Ok(_) => 0,
        Err(_) => -2,
    }
}

#[no_mangle]
pub extern "C" fn lms_s1_g2_ping_slave(id: u8) -> c_int {
    let conn = unsafe {
        match &CONNECTION {
            Some(c) => c.clone(),
            None => return -1,
        }
    };

    match conn.ping_slave(id) {
        Ok(duration) => duration.as_millis() as c_int,
        Err(_) => -2,
    }
}

#[no_mangle]
pub extern "C" fn lms_s1_g2_send_command(id: u8, message: *const c_char) -> c_int {
    if message.is_null() {
        return -1;
    }

    let conn = unsafe {
        match &CONNECTION {
            Some(c) => c.clone(),
            None => return -2,
        }
    };

    let c_str = unsafe { CStr::from_ptr(message) };
    let msg = match c_str.to_str() {
        Ok(s) => s,
        Err(_) => return -3,
    };

    match conn.send_to_slave(id, msg) {
        Ok(_) => 0,
        Err(_) => -4,
    }
}

#[no_mangle]
pub extern "C" fn lms_s1_g2_broadcast(message: *const c_char) -> c_int {
    if message.is_null() {
        return -1;
    }

    let conn = unsafe {
        match &CONNECTION {
            Some(c) => c.clone(),
            None => return -2,
        }
    };

    let c_str = unsafe { CStr::from_ptr(message) };
    let msg = match c_str.to_str() {
        Ok(s) => s,
        Err(_) => return -3,
    };

    match conn.broadcast(msg) {
        Ok(_) => 0,
        Err(_) => -4,
    }
}

#[no_mangle]
pub extern "C" fn lms_s1_g2_get_stats(out_stats: *mut CStats) -> c_int {
    if out_stats.is_null() {
        return -1;
    }

    let conn = unsafe {
        match &CONNECTION {
            Some(c) => c.clone(),
            None => return -2,
        }
    };

    let stats = match conn.get_stats() {
        Ok(s) => s,
        Err(_) => return -3,
    };

    unsafe {
        *out_stats = CStats {
            paired: stats.paired,
            discovered: stats.discovered,
            sent: stats.sent,
            received: stats.received,
            lost: stats.lost,
        };
    }

    0
}

#[no_mangle]
pub extern "C" fn lms_s1_g2_cleanup() {
    unsafe {
        CONNECTION = None;
    }
}

