import React from 'react';
import { CitizenMood } from '../types/sandbox';

interface CitizenSpriteProps {
  id: string;
  avatarColor: string;
  secondaryColor: string;
  mood: CitizenMood;
  isWalking: boolean;
  isSelected: boolean;
  isBotRing?: boolean;
  animPhase: number;
  reducedMotion: boolean;
}

function getMoodRingStroke(mood: CitizenMood): string {
  if (mood === 'delighted' || mood === 'calm') return '#3DDC97'; // green happy
  if (mood === 'annoyed') return '#FFC439'; // amber unsure
  return '#FF5D73'; // red upset
}

export const CitizenSprite: React.FC<CitizenSpriteProps> = ({
  id,
  avatarColor,
  secondaryColor,
  mood,
  isWalking,
  isSelected,
  isBotRing,
  animPhase,
  reducedMotion,
}) => {
  const moodStroke = getMoodRingStroke(mood);
  const seed = id.charCodeAt(0) * 1.7 + (id.charCodeAt(1) || 0) * 0.9;
  const bobY =
    isWalking && !reducedMotion ? Math.sin(animPhase * 9 + seed) * 3.2 : 0;
  const stride =
    isWalking && !reducedMotion ? Math.sin(animPhase * 9 + seed) * 3.5 : 0;
  const tiltDeg =
    isWalking && !reducedMotion ? Math.cos(animPhase * 9 + seed) * 3.5 : 0;

  if (isBotRing) {
    // 3 synchronized hooded sprites for Fraud Ring
    return (
      <svg
        width="64"
        height="54"
        viewBox="0 0 64 54"
        className="overflow-visible drop-shadow-[0_4px_6px_rgba(31,35,64,0.38)]"
        aria-hidden="true"
      >
        <ellipse
          cx="32"
          cy="48"
          rx="24"
          ry="5.5"
          fill="rgba(31,35,64,0.35)"
          stroke={moodStroke}
          strokeWidth="2"
        />
        {[-15, 0, 15].map((offsetX, idx) => {
          const unitBob =
            !reducedMotion ? Math.sin(animPhase * 11 + idx * 1.4) * 2.5 : 0;
          return (
            <g
              key={idx}
              transform={`translate(${32 + offsetX}, ${26 + unitBob})`}
            >
              {/* Capsule Cloak Body */}
              <rect
                x="-8"
                y="0"
                width="16"
                height="18"
                rx="8"
                fill="#1F2340"
                stroke="#FF5D73"
                strokeWidth="1.5"
              />
              {/* Pointed Hood + Round Head */}
              <path
                d="M -9 2 C -9 -10, 0 -15, 0 -15 C 0 -15, 9 -10, 9 2 Z"
                fill="#2B2F54"
                stroke="#FF5D73"
                strokeWidth="1.3"
              />
              <circle cx="0" cy="-3" r="5.5" fill="#111428" />
              {/* Glowing Bot Eyes */}
              <circle cx="-2.2" cy="-3.5" r="1.4" fill="#FF5D73" />
              <circle cx="2.2" cy="-3.5" r="1.4" fill="#FF5D73" />
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <svg
      width="48"
      height="56"
      viewBox="0 0 48 56"
      className="overflow-visible drop-shadow-[0_4px_6px_rgba(31,35,64,0.3)]"
      aria-hidden="true"
    >
      {/* Ground Soft Shadow + Colored Mood Ring */}
      <ellipse
        cx="24"
        cy="49"
        rx={isSelected ? 15 : 13}
        ry={isSelected ? 6 : 5}
        fill="rgba(31, 35, 64, 0.26)"
        stroke={moodStroke}
        strokeWidth={isSelected ? '3' : '2.4'}
      />

      <g transform={`translate(24, ${28 + bobY}) rotate(${tiltDeg})`}>
        {/* Walking Legs */}
        <line
          x1="-4"
          y1="11"
          x2={-4 - stride * 0.5}
          y2={18 + stride * 0.6}
          stroke="#1F2340"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <line
          x1="4"
          y1="11"
          x2={4 + stride * 0.5}
          y2={18 - stride * 0.6}
          stroke="#1F2340"
          strokeWidth="3.2"
          strokeLinecap="round"
        />

        {/* Capsule Body */}
        <rect
          x="-9.5"
          y="-3"
          width="19"
          height="17"
          rx="9.5"
          fill={avatarColor}
          stroke="#1F2340"
          strokeWidth="1.8"
        />

        {/* Outfit Collar / Apron / Detail */}
        <path
          d="M -6 -2 Q 0 4 6 -2"
          fill="none"
          stroke={secondaryColor}
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Props by Persona */}
        {id === 'marge' && (
          /* Shopping Bag */
          <g transform="translate(11, 4)">
            <rect
              x="-3.5"
              y="0"
              width="7"
              height="8"
              rx="1.5"
              fill="#FFC439"
              stroke="#1F2340"
              strokeWidth="1.3"
            />
            <path
              d="M -2 0 C -2 -3, 2 -3, 2 0"
              fill="none"
              stroke="#1F2340"
              strokeWidth="1.2"
            />
          </g>
        )}
        {id === 'priya' && (
          /* Courier Backpack */
          <rect
            x="-12.5"
            y="-2"
            width="5"
            height="12"
            rx="2"
            fill="#0070E0"
            stroke="#1F2340"
            strokeWidth="1.3"
          />
        )}
        {id === 'joe' && (
          /* Grandpa Joe Walking Cane */
          <path
            d="M 11 2 C 14 2, 14 5, 12 5 L 12 18"
            fill="none"
            stroke="#8B5A2B"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}

        {/* Round Head */}
        <circle
          cx="0"
          cy="-11"
          r="8.5"
          fill="#FFE5C8"
          stroke="#1F2340"
          strokeWidth="1.8"
        />

        {/* Facial Expression based on mood */}
        <circle cx="-2.8" cy="-11.5" r="1.2" fill="#1F2340" />
        <circle cx="2.8" cy="-11.5" r="1.2" fill="#1F2340" />
        {mood === 'furious' || mood === 'annoyed' ? (
          <path
            d="M -2.5 -7.5 Q 0 -9.5 2.5 -7.5"
            fill="none"
            stroke="#1F2340"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M -2.8 -8.2 Q 0 -6 2.8 -8.2"
            fill="none"
            stroke="#1F2340"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        )}

        {/* Distinct Hats / Hair per Citizen */}
        {id === 'marge' && (
          /* Wide Sun Hat with Butter Ribbon */
          <g transform="translate(0, -18)">
            <ellipse
              cx="0"
              cy="0"
              rx="12"
              ry="3.2"
              fill="#FFC439"
              stroke="#1F2340"
              strokeWidth="1.5"
            />
            <path
              d="M -6 0 C -6 -6, 6 -6, 6 0 Z"
              fill="#E8765A"
              stroke="#1F2340"
              strokeWidth="1.5"
            />
          </g>
        )}

        {id === 'dave' && (
          /* Dramatic Fedora Hat */
          <g transform="translate(0, -18)">
            <rect
              x="-10"
              y="-1"
              width="20"
              height="2.5"
              rx="1.2"
              fill="#1F2340"
            />
            <path
              d="M -6.5 -1 L -5 -7 L 5 -7 L 6.5 -1 Z"
              fill="#F59E0B"
              stroke="#1F2340"
              strokeWidth="1.5"
            />
          </g>
        )}

        {id === 'priya' && (
          /* Courier Visor Cap */
          <g transform="translate(0, -17)">
            <path
              d="M -7.5 0 C -7.5 -7, 7.5 -7, 7.5 0 Z"
              fill="#0070E0"
              stroke="#1F2340"
              strokeWidth="1.5"
            />
            <path
              d="M 0 -1 L 11 0.5"
              stroke="#1F2340"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>
        )}

        {id === 'gus' && (
          /* Backwards Cap */
          <g transform="translate(0, -17)">
            <path
              d="M -7.5 0 C -7.5 -6.5, 7.5 -6.5, 7.5 0 Z"
              fill="#7FB69E"
              stroke="#1F2340"
              strokeWidth="1.5"
            />
            <path
              d="M -11 0 L -2 0"
              stroke="#E8765A"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>
        )}

        {id === 'luna' && (
          /* Cozy Student Beanie + Pom-Pom */
          <g transform="translate(0, -17)">
            <path
              d="M -8 1 C -8 -7, 8 -7, 8 1 Z"
              fill="#FF5D73"
              stroke="#1F2340"
              strokeWidth="1.5"
            />
            <circle
              cx="0"
              cy="-7"
              r="2.8"
              fill="#FFF8EA"
              stroke="#1F2340"
              strokeWidth="1.3"
            />
          </g>
        )}

        {id === 'omar' && (
          /* Traveler Panama Hat with Blue Band */
          <g transform="translate(0, -18)">
            <ellipse
              cx="0"
              cy="0"
              rx="10.5"
              ry="2.6"
              fill="#FFF8EA"
              stroke="#1F2340"
              strokeWidth="1.5"
            />
            <path
              d="M -6 0 L -5 -6 L 5 -6 L 6 0 Z"
              fill="#FFF8EA"
              stroke="#1F2340"
              strokeWidth="1.5"
            />
            <line
              x1="-5.5"
              y1="-1.5"
              x2="5.5"
              y2="-1.5"
              stroke="#0070E0"
              strokeWidth="2"
            />
          </g>
        )}

        {id === 'joe' && (
          /* Vintage Flat Cap + Glasses */
          <g>
            <circle
              cx="-2.8"
              cy="-11.5"
              r="2.6"
              fill="none"
              stroke="#1F2340"
              strokeWidth="1.1"
            />
            <circle
              cx="2.8"
              cy="-11.5"
              r="2.6"
              fill="none"
              stroke="#1F2340"
              strokeWidth="1.1"
            />
            <path
              d="M -8 -17 C -8 -22, 6 -22, 9 -17 Z"
              fill="#64748B"
              stroke="#1F2340"
              strokeWidth="1.5"
            />
          </g>
        )}
      </g>
    </svg>
  );
};
