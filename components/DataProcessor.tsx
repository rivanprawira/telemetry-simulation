"use client";

import React, { useEffect, useRef } from 'react';
import { useTelemetry } from '@/context/TelemetryContext';
import { useTerminalDashboard, ProcessedTelemetryData } from '@/context/TerminalDashboardContext';
import { GNSSDecompressor } from '@/lib/compression/GNSSDecompressor';
import { TemperatureDecompressor } from '@/lib/compression/TemperatureDecompressor';
import { GasSensorDecompressor } from '@/lib/compression/GasSensorDecompressor';
import { BatteryDecompressor } from '@/lib/compression/BatteryDecompressor';

// Create persistent decompressor instances (maintain state between packets)
const persistentDecompressors = {
  gnss: new GNSSDecompressor(),
  temperature: new TemperatureDecompressor(), 
  co: new GasSensorDecompressor('CO'),
  no2: new GasSensorDecompressor('NO2'),
  so2: new GasSensorDecompressor('SO2'),
  battery: new BatteryDecompressor()
};

// Function to parse NMEA $GPGGA sentence and extract coordinates
function parseNMEA(nmeaString: string): { latitude: number; longitude: number; altitude: number } {
  // Default values
  const defaultData = { latitude: -33.8688, longitude: 151.2093, altitude: 100 };
  
  if (!nmeaString || !nmeaString.startsWith('$GPGGA')) {
    return defaultData;
  }
  
  try {
    const parts = nmeaString.split(',');
    if (parts.length < 15) return defaultData;
    
    // Parse latitude (format: DDMM.MMM,N/S)
    const latStr = parts[2];
    const latDir = parts[3];
    let latitude = 0;
    if (latStr && latDir) {
      const degrees = parseInt(latStr.substring(0, 2));
      const minutes = parseFloat(latStr.substring(2));
      latitude = degrees + minutes / 60;
      if (latDir === 'S') latitude = -latitude;
    }
    
    // Parse longitude (format: DDDMM.MMM,E/W)
    const lonStr = parts[4];
    const lonDir = parts[5];
    let longitude = 0;
    if (lonStr && lonDir) {
      const degrees = parseInt(lonStr.substring(0, 3));
      const minutes = parseFloat(lonStr.substring(3));
      longitude = degrees + minutes / 60;
      if (lonDir === 'W') longitude = -longitude;
    }
    
    // Parse altitude (format: NNN.N,M)
    const altStr = parts[9];
    const altitude = altStr ? parseFloat(altStr) : 100;
    
    return { latitude, longitude, altitude };
  } catch (error) {
    return defaultData;
  }
}

// Component that processes telemetry data and forwards it to Dashboard
export function DataProcessor() {
  const { telemetryData } = useTelemetry();
  const { setProcessedData, setIsReceivingData, setLastUpdateTime, updateDataStats } = useTerminalDashboard();
  
  // Track the last processed timestamp to prevent duplicate processing
  const lastProcessedTimestamp = useRef<number>(0);

  useEffect(() => {
    if (!telemetryData) {
      return;
    }

    // Get current timestamp (handle both compressed and raw formats)
    // Raw data uses transmissionTimestamp, compressed data uses ts
    const currentTimestamp = telemetryData.transmissionTimestamp || telemetryData.ts || telemetryData.timestamp || Date.now();
    

    
    // Prevent processing duplicate data - only process if timestamp has changed
    // Allow small tolerance for timing differences
    if (currentTimestamp && Math.abs(currentTimestamp - lastProcessedTimestamp.current) < 1) {
      return;
    }

    const processData = async () => {
      const startTime = performance.now();
      setIsReceivingData(true);
      


      try {
        let processedData: ProcessedTelemetryData;

        // Check if data is compressed (Base64 compressed gnss) or raw (NMEA string gnss)
        const isCompressed = !!(telemetryData.temp || telemetryData.co || 
                                telemetryData.no2 || telemetryData.so2 || telemetryData.batt);

        if (isCompressed) {
          // COMPRESSED DATA: Decompress it
          processedData = await decompressData(telemetryData);
          processedData.dataSource = 'decompressed';
          
          // Pass through compression metrics if available
          if (telemetryData.compressionMetrics) {
            processedData.compressionMetrics = telemetryData.compressionMetrics;
          }


        } else {
          // RAW DATA: Parse NMEA string and process other raw values
          const nmeaData = parseNMEA(telemetryData.gnss || '');
          processedData = {
            latitude: nmeaData.latitude,
            longitude: nmeaData.longitude,
            altitude: nmeaData.altitude,
            temperature: telemetryData.temperature || 0,
            coLevel: telemetryData.coLevel || 0,
            no2Level: telemetryData.no2Level || 0,
            so2Level: telemetryData.so2Level || 0,
            voltage: telemetryData.voltage || 0,
            current: telemetryData.current || 0,
            batteryPercentage: telemetryData.batteryPercentage || 0,
            batteryStatus: telemetryData.batteryStatus || 'Unknown',
            timestamp: telemetryData.timestamp || Date.now(),
            flightTime: telemetryData.flightTime || 0,
            dataSource: 'raw'
          };


        }

        const endTime = performance.now();
        const processingTime = endTime - startTime;
        
        processedData.processingTime = processingTime;

        // Update last processed timestamp
        lastProcessedTimestamp.current = currentTimestamp;

        // Check if data has transmissionTimestamp (indicates it came from serial reception)
        // If so, don't override the data that SerialTelemetryBridge already processed
        if (telemetryData.transmissionTimestamp) {
          return;
        }

        // Forward processed data to Dashboard
        setProcessedData(processedData);
        setLastUpdateTime(Date.now());
        
        // Update statistics
        updateDataStats(processingTime, isCompressed);
        
      } catch (error) {
      } finally {
        setIsReceivingData(false);
      }
    };

    processData();
  }, [telemetryData]); // Only depend on telemetryData

  // This component doesn't render anything - it's just for data processing
  return null;
}

// Real decompression function using actual decompression algorithms
async function decompressData(compressedData: any): Promise<ProcessedTelemetryData> {
  const decompressionStartTime = performance.now();
  const timestamp = compressedData.ts || Date.now();
  const flightTime = compressedData.time || 0;

  // Use persistent decompressors (maintain state between packets)
  const { gnss: gnssDecompressor, temperature: temperatureDecompressor, co: coDecompressor, 
          no2: no2Decompressor, so2: so2Decompressor, battery: batteryDecompressor } = persistentDecompressors;

  // Default values (in case decompression fails or buffer is empty)
  let latitude = -33.8688;
  let longitude = 151.2093;
  let altitude = 100;
  let temperature = 25;
  let coLevel = 1.2;
  let no2Level = 100;
  let so2Level = 10;
  let voltage = 3.7;
  let current = 1.5;
  let batteryPercentage = 75;
  let batteryStatus = 'Discharging';

  try {
    // Decompress GNSS data
    if (compressedData.gnss) {
      const gnssBuffer = Buffer.from(compressedData.gnss, 'base64');
                  const gnssData = gnssDecompressor.decompressData(gnssBuffer);
      if (gnssData) {
        latitude = gnssData.latitude;
        longitude = gnssData.longitude;
        altitude = gnssData.altitude;
      }
    }

    // Decompress temperature data
    if (compressedData.temp) {
      const tempBuffer = Buffer.from(compressedData.temp, 'base64');
      const tempData = temperatureDecompressor.decompress(tempBuffer);
      if (tempData) {
        temperature = tempData.temperature;
      }
    }

    // Decompress CO data
    if (compressedData.co) {
      const coBuffer = Buffer.from(compressedData.co, 'base64');
      const coData = coDecompressor.decompress(coBuffer);
      if (coData) {
        coLevel = coData.sensorValue;
      }
    }

    // Decompress NO2 data
    if (compressedData.no2) {
      const no2Buffer = Buffer.from(compressedData.no2, 'base64');
      const no2Data = no2Decompressor.decompress(no2Buffer);
      if (no2Data) {
        no2Level = no2Data.sensorValue;
      }
    }

    // Decompress SO2 data
    if (compressedData.so2) {
      const so2Buffer = Buffer.from(compressedData.so2, 'base64');
      const so2Data = so2Decompressor.decompress(so2Buffer);
      if (so2Data) {
        so2Level = so2Data.sensorValue;
      }
    }

    // Decompress battery data
    if (compressedData.batt) {
      const battBuffer = Buffer.from(compressedData.batt, 'base64');
                  const battData = batteryDecompressor.decompressData(battBuffer);
      if (battData) {
        voltage = battData.voltage;
        current = battData.current;
        batteryPercentage = battData.percentage;
        batteryStatus = battData.status;
      }
    }

  } catch (error) {
    // Continue with default values if decompression fails
  }

  const decompressionEndTime = performance.now();
  const decompressionTime = decompressionEndTime - decompressionStartTime;

  const finalResult = {
    latitude,
    longitude,
    altitude,
    temperature,
    coLevel,
    no2Level,
    so2Level,
    voltage,
    current,
    batteryPercentage,
    batteryStatus,
    timestamp,
    flightTime,
    dataSource: 'decompressed',
    decompressionTime
  };

  return finalResult;
} 