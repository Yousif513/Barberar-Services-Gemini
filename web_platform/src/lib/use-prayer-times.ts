"use client";

import { useState, useEffect } from "react";
import { Coordinates, CalculationMethod, PrayerTimes, Madhab } from "adhan";

export interface PrayerTimeInfo {
  nameEn: string;
  nameAr: string;
  time: Date;
  key: string;
}

export interface PrayerBufferConfig {
  before: number;
  after: number;
}

export interface PrayerBuffers {
  [key: string]: PrayerBufferConfig;
}

const defaultBuffers: PrayerBuffers = {
  fajr: { before: 10, after: 30 },
  dhuhr: { before: 10, after: 30 },
  asr: { before: 10, after: 30 },
  maghrib: { before: 10, after: 30 },
  isha: { before: 10, after: 30 }
};

export function usePrayerTimes(
  latitude: number = 24.7136,
  longitude: number = 46.6753,
  buffers: PrayerBuffers = defaultBuffers
) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    // Run on client only
    setCurrentTime(new Date());
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const now = currentTime || new Date();

  const coordinates = new Coordinates(latitude, longitude);
  const params = CalculationMethod.UmmAlQura();
  params.madhab = Madhab.Shafi;

  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayPrayers = new PrayerTimes(coordinates, today, params);
  const tomorrowPrayers = new PrayerTimes(coordinates, tomorrow, params);

  const todayList: PrayerTimeInfo[] = [
    { nameEn: "Fajr", nameAr: "الفجر", time: todayPrayers.fajr, key: "fajr" },
    { nameEn: "Dhuhr", nameAr: "الظهر", time: todayPrayers.dhuhr, key: "dhuhr" },
    { nameEn: "Asr", nameAr: "العصر", time: todayPrayers.asr, key: "asr" },
    { nameEn: "Maghrib", nameAr: "المغرب", time: todayPrayers.maghrib, key: "maghrib" },
    { nameEn: "Isha", nameAr: "العشاء", time: todayPrayers.isha, key: "isha" }
  ];

  const tomorrowList: PrayerTimeInfo[] = [
    { nameEn: "Fajr", nameAr: "الفجر", time: tomorrowPrayers.fajr, key: "fajr" },
    { nameEn: "Dhuhr", nameAr: "الظهر", time: tomorrowPrayers.dhuhr, key: "dhuhr" },
    { nameEn: "Asr", nameAr: "العصر", time: tomorrowPrayers.asr, key: "asr" },
    { nameEn: "Maghrib", nameAr: "المغرب", time: tomorrowPrayers.maghrib, key: "maghrib" },
    { nameEn: "Isha", nameAr: "العشاء", time: tomorrowPrayers.isha, key: "isha" }
  ];

  // Determine next and previous prayers
  let nextPrayerInfo = tomorrowList[0];
  let prevPrayerInfo = todayList[4];

  for (let i = 0; i < todayList.length; i++) {
    if (todayList[i].time > now) {
      nextPrayerInfo = todayList[i];
      prevPrayerInfo = i === 0 ? todayList[4] : todayList[i - 1];
      break;
    }
  }

  const secondsUntilNext = Math.max(0, Math.floor((nextPrayerInfo.time.getTime() - now.getTime()) / 1000));

  let isLocked = false;
  let activeLockPrayerKey = "";
  let activeLockPrayerNameEn = "";
  let activeLockPrayerNameAr = "";
  let resumesIn = 0;
  let lockStartsIn = 0;

  const allPrayersToCheck = [...todayList, ...tomorrowList];

  for (const prayer of allPrayersToCheck) {
    const config = buffers[prayer.key] || defaultBuffers[prayer.key];
    const lockStart = new Date(prayer.time.getTime() - config.before * 60 * 1000);
    const lockEnd = new Date(prayer.time.getTime() + config.after * 60 * 1000);

    if (now >= lockStart && now <= lockEnd) {
      isLocked = true;
      activeLockPrayerKey = prayer.key;
      activeLockPrayerNameEn = prayer.nameEn;
      activeLockPrayerNameAr = prayer.nameAr;
      resumesIn = Math.max(0, Math.floor((lockEnd.getTime() - now.getTime()) / 1000));
      break;
    } else if (now < lockStart) {
      const diff = Math.floor((lockStart.getTime() - now.getTime()) / 1000);
      if (lockStartsIn === 0 || diff < lockStartsIn) {
        lockStartsIn = diff;
      }
    }
  }

  if (lockStartsIn === 0) {
    lockStartsIn = secondsUntilNext;
  }

  const isTimeInLockWindow = (candidate: Date) => {
    const candidateDay = new Date(candidate);
    const candidateTomorrow = new Date(candidate);
    candidateTomorrow.setDate(candidateTomorrow.getDate() + 1);
    const dayPrayers = new PrayerTimes(coordinates, candidateDay, params);
    const nextDayPrayers = new PrayerTimes(coordinates, candidateTomorrow, params);
    const prayerChecks = [
      { time: dayPrayers.fajr, key: "fajr" },
      { time: dayPrayers.dhuhr, key: "dhuhr" },
      { time: dayPrayers.asr, key: "asr" },
      { time: dayPrayers.maghrib, key: "maghrib" },
      { time: dayPrayers.isha, key: "isha" },
      { time: nextDayPrayers.fajr, key: "fajr" }
    ];

    return prayerChecks.some((prayer) => {
      const config = buffers[prayer.key] || defaultBuffers[prayer.key];
      const lockStart = new Date(prayer.time.getTime() - config.before * 60 * 1000);
      const lockEnd = new Date(prayer.time.getTime() + config.after * 60 * 1000);
      return candidate >= lockStart && candidate <= lockEnd;
    });
  };

  return {
    todayTimes: todayList,
    tomorrowTimes: tomorrowList,
    nextPrayer: nextPrayerInfo,
    prevPrayer: prevPrayerInfo,
    secondsUntilNext,
    isLocked,
    resumesIn,
    lockStartsIn,
    activeLockPrayerKey,
    activeLockPrayerNameEn,
    activeLockPrayerNameAr,
    currentTime: now,
    isTimeInLockWindow
  };
}
