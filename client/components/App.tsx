import * as React from "react";

interface IVector {
  euclideanDistance(other: this): number;
  toArray(): number[];
}

export class Vector3D implements IVector {
  constructor(
    public x: number,
    public y: number,
    public z: number
  ) {}

  euclideanDistance(other: Vector3D) {
    let xd = other.x - this.x;
    let yd = other.y - this.y;
    let zd = other.z - this.z;

    return Math.sqrt(
      xd * xd + yd * yd + zd * zd
    );
  }

  scalarMultiply(scalar: number) {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }

  add(other: Vector3D, scalar: number = 1) {
    this.x += other.x * scalar;
    this.y += other.y * scalar;
    this.z += other.z * scalar;
    return this;
  }
  
  toArray() {
    return [ this.x, this.y, this.z ];
  }
}

/*
export class Vector2D implements IVector {
  constructor(
    public x: number,
    public y: number
  ) {}

  euclideanDistance(other: Vector2D) {

  }
}*/

export class Vector1D implements IVector {
  constructor(
    public x: number
  ) {}

  euclideanDistance(other: Vector1D) {
    return Math.abs(other.x - this.x);
  }

  toArray() {
    return [ this.x ];
  }
}

interface IProps {
  dataset: Vector3D[];
  neurons: Neuron<any, Vector3D>[];
}

import { scatter3D } from "./scatter3d";

export class ScatterPlot extends React.Component<IProps, void> {
  protected renderElement: HTMLCanvasElement;

  componentDidMount() {
    scatter3D(
      this.refs["canvas"] as any,
      this.props.dataset.map(v => v.toArray()),
      this.props.neurons.map(n => n.weights).map(v => v.toArray())
    );
  }

  render() {
    return <canvas
      ref="canvas"
      style={{
        width: 800,
        height: 600
      }}
      width="1600"
      height="1200"
    />;
  }
}

class Neuron<TPosition extends IVector, TWeights extends IVector> {
  constructor(
    public position: TPosition,
    public weights: TWeights
  ) {
  }
}

export default class App extends React.Component<void, void> {
  dataset: Vector3D[] = [];
  neurons: Neuron<Vector1D, Vector3D>[] = [];
  
  constructor() {
    super();

    for (let i = 0; i < 500; ++i) {
      let t = Math.random();

      this.dataset.push(new Vector3D(
        Math.sin(t * 24) * t + 0.1 * Math.random(),
        Math.cos(t * 24) * t + 0.1 * Math.random(),
        1.0 - t + 0.1 * Math.random()
      ));
    }

    for (let x = 0; x < 40; ++x)
      this.neurons.push(new Neuron(
        new Vector1D(x),
        new Vector3D(
          Math.random(),
          Math.random(),
          Math.random()
        )
      ));
    
    for (let i = 0; i < 1000; ++i)
      this.iteration();
    
    // alert(this.learningFactor);
  }

  protected learningFactor = 0.1;
  protected neighborSize = 40 / 2;

  protected iteration() {
    let input = this.dataset[Math.floor(Math.random() * this.dataset.length)];
    let bmu = this.neurons.reduce((bmu, neuron) =>
      bmu.weights.euclideanDistance(input) <= neuron.weights.euclideanDistance(input)
      ? bmu
      : neuron
    );

    this.neurons.forEach(neuron => {
      let bmuDistance = bmu.position.euclideanDistance(neuron.position);

      let df = Math.exp(
        -bmuDistance * bmuDistance /
        (2 * this.neighborSize * this.neighborSize)
      );

      let lf = 1.0 - this.learningFactor * df;
      neuron.weights.scalarMultiply(lf);
      neuron.weights.add(input, 1.0 - lf);
    });

    this.learningFactor *= 0.998;
    this.neighborSize *= 0.998;
  }

  render() {
    return <ScatterPlot
      dataset={this.dataset}
      neurons={this.neurons}
    />;
  }
}