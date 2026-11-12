import React from "react";
import { Composition } from "remotion";
import { Caption, Title } from "./Overlays";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Title" component={Title as never}
      durationInFrames={180} fps={30} width={1920} height={1080}
      defaultProps={{ title: "TrustPay", sub: "Conditional payments for agentic commerce" }}
    />
    <Composition
      id="Caption" component={Caption as never}
      durationInFrames={600} fps={30} width={1920} height={240}
      defaultProps={{ text: "", label: undefined, tone: "plain", dur: 240 }}
    />
  </>
);
