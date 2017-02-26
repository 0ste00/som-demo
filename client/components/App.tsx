import * as React from "react";
import { IVector, Vector3D, Vector2D } from "./Vector";

import IconButton from "material-ui/IconButton";
import Slider from "material-ui/Slider";

const numeric = require("numericjs");

class PCA {
  public readonly U: number[][];
  public readonly means: number[];
  public readonly stddevs: number[];
  public readonly data: number[][];

  public readonly min: number[];
  public readonly max: number[];

  constructor(
    data: number[][],
    public readonly k: number // reduction
  ) {
    // normalize data
    this.means = PCA.mean(data);
    data = data.map(row => row.map((v, i) => v - this.means[i]));
    this.stddevs = PCA.squareMean(data).map(Math.sqrt);
    data.forEach(row =>
      row.forEach((v, i) => row[i] /= this.stddevs[i])
    );
    this.data = data;

    // do PCA
    let m = data.length;
    let sigma = numeric.div(numeric.dot(numeric.transpose(data), data), m);
    this.U = (numeric.svd(sigma).U as number[][]).map(row =>
      row.slice(0, k)
    );

    // find min/max
    let projected = numeric.dot(this.data, this.U) as number[][];
    this.min = [ ...projected[0] ];
    this.max = [ ...projected[0] ];
    projected.forEach(row =>
      row.forEach((v, i) => {
        if (this.min[i] > v)
          this.min[i] = v;
        else if (this.max[i] < v)
          this.max[i] = v;
      })
    );

    console.log(this.min, this.max);
  }

  static mean(data: number[][]) {
    return data
      .reduce((sum, row) => {
        for (let i = 0; i < sum.length; ++i)
          sum[i] += row[i];
        return sum;
      }, data[0].map(v => 0))
      .map(v => v / data.length);
  }

  static squareMean(data: number[][]) {
    return data
      .reduce((sum, row) => {
        for (let i = 0; i < sum.length; ++i)
          sum[i] += row[i] * row[i];
        return sum;
      }, data[0].map(v => 0))
      .map(v => v / data.length);
  }

  recover(vector: number[]) {
    vector = vector.map((v, i) => v * (this.max[i] - this.min[i]) + this.min[i]);
    let raw = numeric.dot(vector, numeric.transpose(this.U)) as number[];
    return raw.map((v, i) => v * this.stddevs[i] + this.means[i]);
  }
}

interface IProps {
  dataset: Vector3D[];
  neurons: Neuron<any, Vector3D>[];
  animating: boolean;
}

import { scatter3D } from "./scatter3d";

export class ScatterPlot extends React.Component<IProps, void> {
  protected renderElement: HTMLCanvasElement;
  protected ref: any;

  componentDidMount() {
    this.ref = scatter3D(
      this.refs["canvas"] as any,
      this.props.dataset.map(v => v.toArray()),
      this.props.neurons.map(n => ({
        weights: n.weights,
        position: n.position.toArray()
      }))
    );
  }

  componentWillReceiveProps(props: IProps) {
    this.ref.animating = props.animating;
    this.ref.needsRender = true;
  }

  shouldComponentUpdate() {
    return false;
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

class GridPlot extends React.Component<{
  neurons: Neuron<Vector2D, Vector3D>[],
  tileWidth: number,
  tileHeight: number,
  width: number,
  height: number
}, void> {
  protected colorForNeuron(neuron: Neuron<Vector2D, Vector3D>) {
    return "rgb(" +
      neuron.weights
        .toArray()
        .map(v => Math.max(0, Math.min(Math.floor(v * 255), 255)))
        .join(", ") +
    ")";
  }

  protected avgDistForNeuron(neuron: Neuron<Vector2D, Vector3D>) {
    let neighbors = this.props.neurons
      .filter(neighbor => neuron.position.manhattenDistance(neighbor.position) === 1)
      .map(neighbor => neuron.weights.euclideanDistance(neighbor.weights));
    return neighbors.reduce((sum, v) => sum + v) / neighbors.length;
  }

  componentWillReceiveProps(props: IProps) {
    let canvas = this.refs["canvas"] as HTMLCanvasElement;
    let ctx = canvas.getContext("2d")!;

    let umatrix = new Map<Neuron<Vector2D, Vector3D>, number>();
    props.neurons.forEach(neuron =>
      umatrix.set(neuron, this.avgDistForNeuron(neuron))
    );

    let v = [ ...umatrix.values() ].sort((a, b) => a - b);
    let minDist = v.shift()!;
    let maxDist = v.pop()!;

    // redraw canvas
    props.neurons.forEach(neuron => {
      ctx.fillStyle = this.colorForNeuron(neuron);
      ctx.fillRect(
        neuron.position.x * this.props.tileWidth,
        neuron.position.y * this.props.tileHeight,
        this.props.tileWidth,
        this.props.tileHeight
      );

      let normDist = (umatrix.get(neuron)! - minDist) / (maxDist - minDist);
      let shade = Math.floor(normDist * 255);
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      ctx.fillRect(
        (neuron.position.x + this.props.width) * this.props.tileWidth,
        neuron.position.y * this.props.tileHeight,
        this.props.tileWidth,
        this.props.tileHeight
      );
    });
  }

  shouldComponentUpdate() {
    return false;
  }

  render() {
    return <canvas
      ref="canvas"
      width={2 * this.props.width * this.props.tileWidth}
      height={this.props.height * this.props.tileHeight}
    />;
  }
}

interface IState {
  animationInterval: number | null;
  stepAnimationInterval: number | null;

  learningFactor: number;
  neighborSize: number;
  animationSpeed: number;
}

export default class App extends React.Component<void, IState> {
  dataset: Vector3D[] = [];
  neurons: Neuron<Vector2D, Vector3D>[] = [];
  
  constructor() {
    super();

    this.state = {
      animationInterval: null,
      stepAnimationInterval: null,

      learningFactor: 0.1,
      neighborSize: 24 / 2 * 0.5,
      animationSpeed: 1
    };

    const rnd = () => {
      let u1 = 1.0 - Math.random();
      let u2 = 1.0 - Math.random();
      
      return Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
    };

    /*
    let centers = [
      [ 0, 0, 0 ],
      [ 0, 1, 0 ],
      [ 0, 0, 1 ],
      [ 1, 0, 0 ],
      [ 0.2, 0.5, 0.7 ],
      [ 0.7, 0.1, 0.8 ],
      [ 0.5, 0.6, 0.4 ]
    ];*/

    let centers = [];
    for (let i = 0; i < 6; ++i)
      centers.push([
        Math.random(),
        Math.random(),
        Math.random()
      ]);

    for (let i = 0; i < 10000; ++i) {
      /*if (0 < 1) {
        let a = rnd();
        let b = rnd();

        this.dataset.push(new Vector3D(
          a * 0.5 + b * 0.2,
          a * 0.2 + b,
          b * 0.8
        ));
      } else */if (0 > 1) {
        let a = rnd() * 0.4;
        let b = rnd() * 0.4;

        this.dataset.push(new Vector3D(
          Math.sin(1.5 * a) + rnd() * 0.02 + 0.5,
          (Math.cos(1.5 * a) + Math.sin(2.5 * b)) * 0.5 + rnd() * 0.02 + 0.2,
          Math.cos(2.5 * b) + rnd() * 0.02 + 0.2 
        ));
      } else {
        let [ cx, cy, cz ] = centers[Math.floor(Math.random() * centers.length)];

        this.dataset.push(new Vector3D(
          rnd() * 0.01 + cx,
          rnd() * 0.01 + cy,
          rnd() * 0.01 + cz
        ));
      }
    }

    let pca = new PCA(
      this.dataset
        .filter((v, index) => index % 10 === 0)
        .map(vector => vector.toArray()),
      2
    );

    for (let x = 0; x < 24; ++x)
      for (let y = 0; y < 24; ++y) {
        let [ wx, wy, wz ] = pca.recover([ (x + 0.5) / 24, (y + 0.5) / 24 ]);
        this.neurons.push(new Neuron(
          new Vector2D(x, y),
          new Vector3D(
            wx, wy, wz
            // Math.random(),
            // Math.random(),
            // Math.random()
          )
        ));
      }
  }

  protected startAnimating() {
    if (this.isAnimating)
      return;
    
    this.setState({
      animationInterval: setInterval(() => {
        this.iterate(this.state.animationSpeed < 1 ? 1 : this.state.animationSpeed);
      }, 1000 / 30 / (this.state.animationSpeed < 1 ? this.state.animationSpeed : 1)) as any
    })
  }

  protected stopAnimating() {
    clearInterval(this.state.animationInterval as any);
    this.setState({
      animationInterval: null
    });
  }

  protected iterate(count: number = 1) {
    let learningFactor = this.state.learningFactor;
    let neighborSize = this.state.neighborSize;
    
    for (let i = 0; i < count; ++i) {
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
          (2 * this.state.neighborSize * this.state.neighborSize)
        );

        let lf = 1.0 - this.state.learningFactor * df;
        neuron.weights.scalarMultiply(lf);
        neuron.weights.add(input, 1.0 - lf);
      });

      learningFactor *= 0.99995;
      neighborSize *= 0.99995;
    }

    this.setState({
      learningFactor,
      neighborSize
    });
  }

  protected iterateAnimated() {
    if (this.state.stepAnimationInterval !== null)
      return;
    
    let input = this.dataset[Math.floor(Math.random() * this.dataset.length)];
    let bmu = this.neurons.reduce((bmu, neuron) =>
      bmu.weights.euclideanDistance(input) <= neuron.weights.euclideanDistance(input)
      ? bmu
      : neuron
    );

    let positions = new Map<Neuron<Vector2D, Vector3D>, [ Vector3D, Vector3D ]>();

    this.neurons.forEach(neuron => {
      let bmuDistance = bmu.position.euclideanDistance(neuron.position);

      let df = Math.exp(
        -bmuDistance * bmuDistance /
        (2 * this.state.neighborSize * this.state.neighborSize)
      );

      let lf = 1.0 - this.state.learningFactor * df;
      let newPos = neuron.weights.clone();
      newPos.scalarMultiply(lf);
      newPos.add(input, 1.0 - lf);
      positions.set(neuron, [ neuron.weights.clone(), newPos ]);
    });

    let t = 0;
    this.setState({
      stepAnimationInterval: setInterval(() => {
        positions.forEach(([ a, b ], neuron) => {
          let e = t < 0.5 ? 4 * Math.pow(t, 3) : 4 * Math.pow(t - 1, 3) + 1;
          
          neuron.weights
            .zero()
            .add(a, 1 - e)
            .add(b, e);
        });

        this.forceUpdate();
        if (t >= 1) {
          clearInterval(this.state.stepAnimationInterval as any);
          this.setState({
            stepAnimationInterval: null
          });

          return;
        }

        t += 0.05; // @todo Magic constant
      }, 1000 / 30) as any
    });
  }

  get isAnimating() {
    return this.state.animationInterval !== null;
  }

  protected reset() {
    this.stopAnimating();

    this.setState({
      learningFactor: 0.1,
      neighborSize: 24 / 2
    });

    this.neurons.forEach(neuron => {
      neuron.weights.x = Math.random();
      neuron.weights.y = Math.random();
      neuron.weights.z = Math.random();
    });
  }

  render() {
    return <div>
      <ScatterPlot
        dataset={this.dataset}
        neurons={this.neurons}
        animating={
          this.state.animationInterval !== null ||
          this.state.stepAnimationInterval !== null
        }
      />
      <b>LF:</b> {this.state.learningFactor.toFixed(5)}, <b>NS:</b> {this.state.neighborSize.toFixed(5)}
      <IconButton
        iconClassName="material-icons"
        tooltip={this.isAnimating ? "Stop animation" : "Start animation"}
        onClick={(this.isAnimating ? this.stopAnimating : this.startAnimating).bind(this)}
      >
        {this.isAnimating ? "pause" : "play_arrow"}
      </IconButton>
      <IconButton
        iconClassName="material-icons"
        tooltip="Reset"
        onClick={() => this.reset()}
      >
        replay
      </IconButton>
      <IconButton
        iconClassName="material-icons"
        tooltip="One iteration"
        onClick={() => this.iterateAnimated()}
      >
        skip_next
      </IconButton>
      <Slider
        min={1}
        max={1000}
        value={this.state.animationSpeed}
        onChange={(event, animationSpeed) => this.setState({ animationSpeed })}
      />
      <GridPlot
        neurons={this.neurons.concat([])}
        tileWidth={10}
        tileHeight={10}
        width={24}
        height={24}
      />
    </div>;
  }
}
